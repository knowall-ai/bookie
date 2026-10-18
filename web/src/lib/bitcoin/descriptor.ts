/**
 * Watch-only Bitcoin wallets: parse an extended public key (xpub/ypub/zpub and their
 * testnet forms) or an output descriptor, and derive its receive and change scripts.
 *
 * Supported: `pkh`, `wpkh`, `sh(wpkh)`, `tr` (single key, BIP86 key-path only) and
 * `wsh(multi|sortedmulti)`. Keys must be extended public keys with a ranged,
 * non-hardened path (`/<0;1>/*` for receive and change, or a single `/.../*` chain).
 * Private keys are refused outright: Bookie never needs to spend.
 *
 * Pure functions on audited libraries (@scure/bip32, @scure/btc-signer), so the
 * BIP84/86/49 and Bitcoin Core vectors are checked in unit tests.
 */
import { HDKey } from '@scure/bip32';
import { base58check, hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import * as btc from '@scure/btc-signer';
import { WalletError } from './errors';

export type Network = 'mainnet' | 'testnet';
export type ScriptType = 'pkh' | 'sh-wpkh' | 'wpkh' | 'tr' | 'wsh-multi';
export type Chain = 'receive' | 'change';

/** A derivation step after the extended key: an index, or a `<receive;change>` pair. */
export type PathStep = number | [number, number];

export interface DescriptorKey {
  /** The key as xpub (mainnet) or tpub (testnet), whatever prefix it was given with. */
  xpub: string;
  /** `[fingerprint/path]` key origin, kept for the canonical text. */
  origin?: string;
  /** Steps after the key and before the final `/*`. */
  steps: PathStep[];
}

export interface WalletDescriptor {
  type: ScriptType;
  network: Network;
  keys: DescriptorKey[];
  /** Multisig only: signatures required. */
  threshold?: number;
  /** Multisig only: `sortedmulti`. */
  sorted?: boolean;
  /** False for a single-chain descriptor (no `<0;1>`): there is no change chain to scan. */
  hasChange: boolean;
  /** The descriptor in canonical form, with its BIP380 checksum. */
  canonical: string;
}

export class DescriptorError extends WalletError {
  constructor(message: string) {
    super(message);
    this.name = 'DescriptorError';
  }
}

export const SCRIPT_TYPE_LABELS: Record<ScriptType, string> = {
  pkh: 'Legacy (P2PKH)',
  'sh-wpkh': 'Nested SegWit (P2SH-P2WPKH)',
  wpkh: 'Native SegWit (P2WPKH)',
  tr: 'Taproot (P2TR)',
  'wsh-multi': 'Multisig (P2WSH)',
};

/** "2-of-3 multisig (P2WSH)" or the script type label. */
export function describeWallet(d: Pick<WalletDescriptor, 'type' | 'threshold' | 'keys'>): string {
  if (d.type === 'wsh-multi') return `${d.threshold}-of-${d.keys.length} multisig (P2WSH)`;
  return SCRIPT_TYPE_LABELS[d.type];
}

/* ------------------------------------------------------------------ */
/* Extended key versions (SLIP-0132)                                   */
/* ------------------------------------------------------------------ */

const b58 = base58check(sha256);

interface KeyVersion {
  network: Network;
  /** The script type the prefix implies, or undefined for xpub/tpub (ambiguous). */
  implies?: 'sh-wpkh' | 'wpkh';
  private: boolean;
}

const VERSIONS: Record<number, KeyVersion> = {
  0x0488b21e: { network: 'mainnet', private: false }, // xpub
  0x049d7cb2: { network: 'mainnet', implies: 'sh-wpkh', private: false }, // ypub
  0x04b24746: { network: 'mainnet', implies: 'wpkh', private: false }, // zpub
  0x043587cf: { network: 'testnet', private: false }, // tpub
  0x044a5262: { network: 'testnet', implies: 'sh-wpkh', private: false }, // upub
  0x045f1cf6: { network: 'testnet', implies: 'wpkh', private: false }, // vpub
  0x0488ade4: { network: 'mainnet', private: true }, // xprv
  0x049d7878: { network: 'mainnet', private: true }, // yprv
  0x04b2430c: { network: 'mainnet', private: true }, // zprv
  0x04358394: { network: 'testnet', private: true }, // tprv
  0x044a4e28: { network: 'testnet', private: true }, // uprv
  0x045f18bc: { network: 'testnet', private: true }, // vprv
};

const XPUB = { mainnet: 0x0488b21e, testnet: 0x043587cf } as const;
const BIP32_VERSIONS = {
  mainnet: { private: 0x0488ade4, public: 0x0488b21e },
  testnet: { private: 0x04358394, public: 0x043587cf },
} as const;

const PRIVATE_KEY_MESSAGE =
  'That is a private key. Bookie only needs the public key (xpub, ypub or zpub), and you should never paste a private key anywhere.';

/** Decode any SLIP-0132 extended public key and re-encode it with the plain xpub/tpub version. */
function normaliseExtendedKey(text: string): { xpub: string; version: KeyVersion } {
  let raw: Uint8Array;
  try {
    raw = b58.decode(text);
  } catch {
    throw new DescriptorError('That extended key is not valid (its checksum does not match).');
  }
  if (raw.length !== 78) throw new DescriptorError('That extended key is the wrong length.');
  const versionNumber = new DataView(raw.buffer, raw.byteOffset, 4).getUint32(0);
  const version = VERSIONS[versionNumber];
  if (!version) throw new DescriptorError('Bookie does not recognise that extended key prefix.');
  if (version.private) throw new DescriptorError(PRIVATE_KEY_MESSAGE);
  const out = new Uint8Array(raw);
  new DataView(out.buffer).setUint32(0, XPUB[version.network]);
  const xpub = b58.encode(out);
  // Validate the key itself (the point must be on the curve).
  try {
    HDKey.fromExtendedKey(xpub, BIP32_VERSIONS[version.network]);
  } catch {
    throw new DescriptorError('That extended key is not a valid public key.');
  }
  return { xpub, version };
}

/* ------------------------------------------------------------------ */
/* BIP380 descriptor checksum                                          */
/* ------------------------------------------------------------------ */

const INPUT_CHARSET =
  '0123456789()[],\'/*abcdefgh@:$%{}IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~ijklmnopqrstuvwxyzABCDEFGH`#"\\ ';
const CHECKSUM_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0xf5dee51989n, 0xa9fdca3312n, 0x1bab10e32dn, 0x3706b1677an, 0x644d626ffdn];

function polymod(symbols: number[]): bigint {
  let chk = 1n;
  for (const value of symbols) {
    const top = chk >> 35n;
    chk = ((chk & 0x7ffffffffn) << 5n) ^ BigInt(value);
    for (let i = 0; i < 5; i++) if ((top >> BigInt(i)) & 1n) chk ^= GENERATOR[i];
  }
  return chk;
}

function expand(s: string): number[] | undefined {
  const symbols: number[] = [];
  let groups: number[] = [];
  for (const c of s) {
    const v = INPUT_CHARSET.indexOf(c);
    if (v === -1) return undefined;
    symbols.push(v & 31);
    groups.push(v >> 5);
    if (groups.length === 3) {
      symbols.push(groups[0] * 9 + groups[1] * 3 + groups[2]);
      groups = [];
    }
  }
  if (groups.length === 1) symbols.push(groups[0]);
  else if (groups.length === 2) symbols.push(groups[0] * 3 + groups[1]);
  return symbols;
}

/** The 8-character BIP380 checksum of a descriptor (without `#`). */
export function descriptorChecksum(descriptor: string): string {
  const symbols = expand(descriptor);
  if (!symbols)
    throw new DescriptorError('The descriptor contains characters that are not allowed.');
  const checksum = polymod([...symbols, 0, 0, 0, 0, 0, 0, 0, 0]) ^ 1n;
  let out = '';
  for (let i = 0; i < 8; i++)
    out += CHECKSUM_CHARSET[Number((checksum >> BigInt(5 * (7 - i))) & 31n)];
  return out;
}

/** True when `descriptor#checksum` is valid. */
export function verifyDescriptorChecksum(withChecksum: string): boolean {
  const at = withChecksum.lastIndexOf('#');
  if (at === -1 || withChecksum.length - at !== 9) return false;
  const body = withChecksum.slice(0, at);
  const sum = withChecksum.slice(at + 1);
  if (![...sum].every((c) => CHECKSUM_CHARSET.includes(c))) return false;
  const symbols = expand(body);
  if (!symbols) return false;
  return polymod([...symbols, ...[...sum].map((c) => CHECKSUM_CHARSET.indexOf(c))]) === 1n;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

const MAX_INDEX = 0x7fffffff;

function parseIndex(text: string): number {
  if (/^\d+['hH]$/.test(text)) {
    throw new DescriptorError(
      'Hardened steps after an xpub cannot be derived from a public key. Give the account xpub with a non-hardened path such as /<0;1>/*.'
    );
  }
  if (!/^\d+$/.test(text)) throw new DescriptorError(`"${text}" is not a valid derivation step.`);
  const value = Number(text);
  if (value > MAX_INDEX) throw new DescriptorError(`Derivation step ${text} is out of range.`);
  return value;
}

function parseKey(text: string): DescriptorKey & { network: Network } {
  let rest = text.trim();
  let origin: string | undefined;
  if (rest.startsWith('[')) {
    const end = rest.indexOf(']');
    if (end === -1) throw new DescriptorError('A key origin is missing its closing "]".');
    origin = rest.slice(1, end);
    if (!/^[0-9a-fA-F]{8}(\/\d+['hH]?)*$/.test(origin)) {
      throw new DescriptorError(
        'The key origin must be a fingerprint and path, like [d34db33f/84h/0h/0h].'
      );
    }
    rest = rest.slice(end + 1);
  }
  const [keyText, ...path] = rest.split('/');
  if (/^(0[23][0-9a-fA-F]{64}|[0-9a-fA-F]{64})$/.test(keyText)) {
    throw new DescriptorError(
      'Bookie needs extended public keys (xpub) so it can find every address; a single public key is not enough.'
    );
  }
  const { xpub, version } = normaliseExtendedKey(keyText);
  if (version.implies) {
    throw new DescriptorError(
      'Inside a descriptor, give keys as xpub (or tpub), not ypub or zpub.'
    );
  }
  if (path.at(-1) !== '*') {
    throw new DescriptorError('Each key needs a ranged path ending in /*, such as /<0;1>/*.');
  }
  if (path.some((p, i) => i < path.length - 1 && p === '*')) {
    throw new DescriptorError('Only the last derivation step may be *.');
  }
  const steps: PathStep[] = path.slice(0, -1).map((step) => {
    const multi = /^<([^;>]+);([^;>]+)>$/.exec(step);
    if (multi) return [parseIndex(multi[1]), parseIndex(multi[2])] as [number, number];
    if (step.startsWith('<')) {
      throw new DescriptorError('Use <receive;change> with exactly two steps, such as <0;1>.');
    }
    return parseIndex(step);
  });
  if (steps.filter(Array.isArray).length > 1) {
    throw new DescriptorError('A key may have only one <receive;change> step.');
  }
  return { xpub, origin, steps, network: version.network };
}

/** Split `a,b,c` at top level (not inside brackets). */
function splitArgs(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{' || c === '<') depth++;
    else if (c === ')' || c === ']' || c === '}' || c === '>') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** `name(inner)` → inner, or undefined when `text` isn't that function. */
function unwrap(text: string, name: string): string | undefined {
  if (!text.startsWith(`${name}(`) || !text.endsWith(')')) return undefined;
  return text.slice(name.length + 1, -1);
}

function keyText(k: DescriptorKey): string {
  const path = k.steps.map((s) => (Array.isArray(s) ? `<${s[0]};${s[1]}>` : String(s)));
  return `${k.origin ? `[${k.origin}]` : ''}${k.xpub}/${[...path, '*'].join('/')}`;
}

function canonicalBody(d: Omit<WalletDescriptor, 'canonical' | 'hasChange'>): string {
  const keys = d.keys.map(keyText);
  switch (d.type) {
    case 'pkh':
      return `pkh(${keys[0]})`;
    case 'wpkh':
      return `wpkh(${keys[0]})`;
    case 'sh-wpkh':
      return `sh(wpkh(${keys[0]}))`;
    case 'tr':
      return `tr(${keys[0]})`;
    case 'wsh-multi':
      return `wsh(${d.sorted ? 'sortedmulti' : 'multi'}(${d.threshold},${keys.join(',')}))`;
  }
}

function build(
  type: ScriptType,
  keys: (DescriptorKey & { network: Network })[],
  extra: { threshold?: number; sorted?: boolean } = {}
): WalletDescriptor {
  const network = keys[0].network;
  if (keys.some((k) => k.network !== network)) {
    throw new DescriptorError('All keys must be on the same network (mainnet or testnet).');
  }
  const multipath = keys.map((k) => k.steps.some(Array.isArray));
  if (multipath.some((m) => m !== multipath[0])) {
    throw new DescriptorError('Either every key or no key may have a <receive;change> step.');
  }
  const plain = keys.map(({ xpub, origin, steps }) => ({ xpub, origin, steps }));
  const base = { type, network, keys: plain, ...extra };
  const body = canonicalBody(base);
  return {
    ...base,
    hasChange: multipath[0],
    canonical: `${body}#${descriptorChecksum(body)}`,
  };
}

function parseDescriptor(text: string): WalletDescriptor {
  let body = text;
  const hash = text.indexOf('#');
  if (hash !== -1) {
    if (!verifyDescriptorChecksum(text)) {
      throw new DescriptorError(
        'The descriptor checksum (after #) does not match. Copy it again from your wallet.'
      );
    }
    body = text.slice(0, hash);
  }
  const wpkh = unwrap(body, 'wpkh');
  if (wpkh !== undefined) return build('wpkh', [parseKey(wpkh)]);
  const pkh = unwrap(body, 'pkh');
  if (pkh !== undefined) return build('pkh', [parseKey(pkh)]);
  const sh = unwrap(body, 'sh');
  if (sh !== undefined) {
    const inner = unwrap(sh, 'wpkh');
    if (inner === undefined) throw new DescriptorError('Bookie supports sh(wpkh(...)) only.');
    return build('sh-wpkh', [parseKey(inner)]);
  }
  const tr = unwrap(body, 'tr');
  if (tr !== undefined) {
    if (splitArgs(tr).length > 1) {
      throw new DescriptorError(
        'Taproot with script paths is not supported yet: use a single-key tr(...).'
      );
    }
    return build('tr', [parseKey(tr)]);
  }
  const wsh = unwrap(body, 'wsh');
  if (wsh !== undefined) {
    const sortedInner = unwrap(wsh, 'sortedmulti');
    const inner = sortedInner ?? unwrap(wsh, 'multi');
    if (inner === undefined) {
      throw new DescriptorError('Bookie supports wsh(multi(...)) and wsh(sortedmulti(...)) only.');
    }
    const [k, ...keyArgs] = splitArgs(inner);
    if (!/^\d+$/.test(k.trim()))
      throw new DescriptorError('The multisig threshold must be a number.');
    const threshold = Number(k);
    if (keyArgs.length < 1 || keyArgs.length > 20) {
      throw new DescriptorError('A multisig needs between 1 and 20 keys.');
    }
    if (threshold < 1 || threshold > keyArgs.length) {
      throw new DescriptorError(`The threshold must be between 1 and ${keyArgs.length}.`);
    }
    return build('wsh-multi', keyArgs.map(parseKey), {
      threshold,
      sorted: sortedInner !== undefined,
    });
  }
  throw new DescriptorError(
    'Bookie supports xpub/ypub/zpub keys and the descriptors pkh, wpkh, sh(wpkh), tr and wsh(multi or sortedmulti).'
  );
}

/**
 * Parse what a member pasted: an extended public key or an output descriptor.
 * A bare xpub/tpub doesn't say which addresses it makes, so `scriptType` is
 * required for it; ypub/zpub (and upub/vpub) imply theirs. Bare keys scan the
 * standard receive (/0/*) and change (/1/*) chains.
 */
export function parseWalletInput(input: string, scriptType?: ScriptType): WalletDescriptor {
  const text = input.replace(/\s+/g, '');
  if (!text) throw new DescriptorError('Paste an xpub, ypub, zpub or an output descriptor.');
  if (/(^|[(,\]])[xyztuv]prv/.test(text)) {
    throw new DescriptorError(PRIVATE_KEY_MESSAGE);
  }
  if (text.includes('(')) {
    const parsed = parseDescriptor(text);
    if (scriptType && scriptType !== parsed.type) {
      throw new DescriptorError(
        'The descriptor already says which script type it uses; leave the script type blank.'
      );
    }
    return parsed;
  }
  const { xpub, version } = normaliseExtendedKey(text);
  const type = version.implies ?? scriptType;
  if (!type) {
    throw new DescriptorError(
      'An xpub does not say which kind of addresses it makes. Choose the script type your wallet uses.'
    );
  }
  if (version.implies && scriptType && scriptType !== version.implies) {
    throw new DescriptorError(
      `That key's prefix means ${SCRIPT_TYPE_LABELS[version.implies]}; it cannot be used as ${SCRIPT_TYPE_LABELS[scriptType]}.`
    );
  }
  if (type === 'wsh-multi') {
    throw new DescriptorError(
      'A multisig needs a descriptor with all its keys: wsh(sortedmulti(...)).'
    );
  }
  return build(type, [{ xpub, steps: [[0, 1]], network: version.network }]);
}

/* ------------------------------------------------------------------ */
/* Derivation                                                          */
/* ------------------------------------------------------------------ */

export function btcNetwork(network: Network) {
  return network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK;
}

export interface DerivedScript {
  chain: Chain;
  index: number;
  /** scriptPubKey bytes, hex. */
  script: string;
  address: string;
}

/**
 * A deriver for one descriptor: caches the per-chain parent keys, so deriving
 * hundreds of addresses doesn't repeat the path every time.
 */
export function scriptDeriver(d: WalletDescriptor) {
  const versions = BIP32_VERSIONS[d.network];
  const network = btcNetwork(d.network);
  const parents = new Map<Chain, HDKey[]>();

  const parentKeys = (chain: Chain): HDKey[] => {
    const hit = parents.get(chain);
    if (hit) return hit;
    if (chain === 'change' && !d.hasChange) {
      throw new DescriptorError('This descriptor has no change chain.');
    }
    const keys = d.keys.map((k) => {
      let node = HDKey.fromExtendedKey(k.xpub, versions);
      for (const step of k.steps) {
        node = node.deriveChild(Array.isArray(step) ? step[chain === 'receive' ? 0 : 1] : step);
      }
      return node;
    });
    parents.set(chain, keys);
    return keys;
  };

  return (chain: Chain, index: number): DerivedScript => {
    if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) {
      throw new DescriptorError('Address index out of range.');
    }
    const pubkeys = parentKeys(chain).map((k) => {
      const pk = k.deriveChild(index).publicKey;
      if (!pk) throw new DescriptorError('Could not derive a public key.');
      return pk;
    });
    let payment: { script: Uint8Array; address?: string };
    switch (d.type) {
      case 'pkh':
        payment = btc.p2pkh(pubkeys[0], network);
        break;
      case 'wpkh':
        payment = btc.p2wpkh(pubkeys[0], network);
        break;
      case 'sh-wpkh':
        payment = btc.p2sh(btc.p2wpkh(pubkeys[0], network), network);
        break;
      case 'tr':
        // BIP86: key-path only, the internal key tweaked with no script tree.
        payment = btc.p2tr(pubkeys[0].slice(1), undefined, network);
        break;
      case 'wsh-multi': {
        const keys = d.sorted ? [...pubkeys].sort(btc.utils.compareBytes) : pubkeys;
        payment = btc.p2wsh(btc.p2ms(d.threshold ?? 1, keys), network);
        break;
      }
    }
    if (!payment.address) throw new DescriptorError('Could not make an address for this script.');
    return { chain, index, script: hex.encode(payment.script), address: payment.address };
  };
}

/** Electrum's script hash: SHA-256 of the scriptPubKey, byte-reversed, hex. */
export function electrumScriptHash(scriptHex: string): string {
  return hex.encode(sha256(hex.decode(scriptHex)).reverse());
}
