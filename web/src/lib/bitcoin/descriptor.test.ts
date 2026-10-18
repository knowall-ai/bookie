import { describe, expect, it } from 'vitest';
import { hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  DescriptorError,
  describeWallet,
  descriptorChecksum,
  electrumScriptHash,
  parseWalletInput,
  scriptDeriver,
  verifyDescriptorChecksum,
} from './descriptor';

/*
 * Public test vectors only (BIP84, BIP86, BIP49, BIP380 and Bitcoin Core's
 * descriptor_tests.cpp). They come from the well-known "abandon ... about"
 * test mnemonic and are not anyone's wallet.
 */

// BIP84: m/84'/0'/0'
const BIP84_ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
// BIP86: m/86'/0'/0'
const BIP86_XPUB =
  'xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ';
// BIP49: m/49'/1'/0' (testnet)
const BIP49_UPUB =
  'upub5EFU65HtV5TeiSHmZZm7FUffBGy8UKeqp7vw43jYbvZPpoVsgU93oac7Wk3u6moKegAEWtGNF8DehrnHtv21XXEMYRUocHqguyjknFHYfgY';
const BIP84_ZPRV =
  'zprvAdG4iTXWBoARxkkzNpNh8r6Qag3irQB8PzEMkAFeTRXxHpbF9z4QgEvBRmfvqWvGp42t42nvgGpNgYSJA9iefm1yYNZKEm7z6qUWCroSQnE';

describe('BIP84 (P2WPKH, zpub)', () => {
  const wallet = parseWalletInput(BIP84_ZPUB);
  const derive = scriptDeriver(wallet);

  it('implies native SegWit with receive and change chains', () => {
    expect(wallet.type).toBe('wpkh');
    expect(wallet.network).toBe('mainnet');
    expect(wallet.hasChange).toBe(true);
    // The same key with the plain xpub version bytes (used by the e2e test).
    expect(wallet.keys[0].xpub).toBe(
      'xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V'
    );
    expect(wallet.canonical).toMatch(/^wpkh\(xpub[1-9A-HJ-NP-Za-km-z]+\/<0;1>\/\*\)#[a-z0-9]{8}$/);
    expect(verifyDescriptorChecksum(wallet.canonical)).toBe(true);
  });

  it('derives the published addresses', () => {
    expect(derive('receive', 0).address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(derive('receive', 1).address).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
    expect(derive('change', 0).address).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
  });

  it('parses its own canonical descriptor to the same addresses', () => {
    const again = scriptDeriver(parseWalletInput(wallet.canonical));
    expect(again('receive', 0).address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(again('change', 0).address).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
  });
});

describe('BIP86 (Taproot)', () => {
  it('derives the published addresses from a bare xpub with the tr script type', () => {
    const derive = scriptDeriver(parseWalletInput(BIP86_XPUB, 'tr'));
    const first = derive('receive', 0);
    expect(first.script).toBe(
      '5120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c'
    );
    expect(first.address).toBe('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
    expect(derive('receive', 1).address).toBe(
      'bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh'
    );
    expect(derive('change', 0).address).toBe(
      'bc1p3qkhfews2uk44qtvauqyr2ttdsw7svhkl9nkm9s9c3x4ax5h60wqwruhk7'
    );
  });

  it('derives the same from a tr() descriptor with a key origin', () => {
    const derive = scriptDeriver(parseWalletInput(`tr([73c5da0a/86h/0h/0h]${BIP86_XPUB}/<0;1>/*)`));
    expect(derive('receive', 0).address).toBe(
      'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'
    );
  });
});

describe('BIP49 (P2SH-P2WPKH, testnet upub)', () => {
  it('derives the published address', () => {
    const wallet = parseWalletInput(BIP49_UPUB);
    expect(wallet.type).toBe('sh-wpkh');
    expect(wallet.network).toBe('testnet');
    expect(scriptDeriver(wallet)('receive', 0).address).toBe('2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2');
  });

  it('derives the same from sh(wpkh(tpub...))', () => {
    const tpub = parseWalletInput(BIP49_UPUB).keys[0].xpub;
    expect(tpub.startsWith('tpub')).toBe(true);
    const derive = scriptDeriver(parseWalletInput(`sh(wpkh(${tpub}/<0;1>/*))`));
    expect(derive('receive', 0).address).toBe('2Mww8dCYPUpKHofjgcXcBCEGmniw9CoaiD2');
  });
});

describe('multisig (Bitcoin Core descriptor_tests.cpp)', () => {
  // Core: sortedmulti(2,xpub6ERA.../*,xpub68NZ.../0/0/*) and its expected scripts for 0, 1, 2.
  const A =
    'xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL';
  const B =
    'xpub68NZiKmJWnxxS6aaHmn81bvJeTESw724CRDs6HbuccFQN9Ku14VQrADWgqbhhTHBaohPX4CjNLf9fq9MYo6oDaPPLPxSb7gwQN3ih19Zm4Y';
  const expectedMultisig = [
    '5221025d5fc65ebb8d44a5274b53bac21ff8307fec2334a32df05553459f8b1f7fe1b62102fbd47cc8034098f0e6a94c6aeee8528abf0a2153a5d8e46d325b7284c046784652ae',
    '52210264fd4d1f5dea8ded94c61e9641309349b62f27fbffe807291f664e286bfbe6472103f4ece6dfccfa37b211eb3d0af4d0c61dba9ef698622dc17eecdf764beeb005a652ae',
    '5221022ccabda84c30bad578b13c89eb3b9544ce149787e5b538175b1d1ba259cbb83321024d902e1a2fc7a8755ab5b694c575fce742c48d9ff192e63df5193e4c7afe1f9c52ae',
  ];

  it('wsh(sortedmulti) wraps the Core vector scripts in P2WSH', () => {
    const wallet = parseWalletInput(`wsh(sortedmulti(2,${A}/*,${B}/0/0/*))`);
    expect(wallet.type).toBe('wsh-multi');
    expect(wallet.threshold).toBe(2);
    expect(wallet.sorted).toBe(true);
    expect(wallet.hasChange).toBe(false);
    expect(describeWallet(wallet)).toBe('2-of-2 multisig (P2WSH)');
    const derive = scriptDeriver(wallet);
    expectedMultisig.forEach((ms, i) => {
      const witnessProgram = hex.encode(sha256(hex.decode(ms)));
      expect(derive('receive', i).script).toBe(`0020${witnessProgram}`);
      expect(derive('receive', i).address).toMatch(/^bc1q[a-z0-9]{58}$/);
    });
  });

  it('has no change chain without <0;1>', () => {
    const derive = scriptDeriver(parseWalletInput(`wsh(sortedmulti(2,${A}/*,${B}/0/0/*))`));
    expect(() => derive('change', 0)).toThrow(DescriptorError);
  });

  it('multi keeps the key order, so it differs from sortedmulti when keys are unsorted', () => {
    const sorted = scriptDeriver(parseWalletInput(`wsh(sortedmulti(1,${A}/*,${B}/0/0/*))`));
    const ordered = scriptDeriver(parseWalletInput(`wsh(multi(1,${B}/0/0/*,${A}/*))`));
    const reordered = scriptDeriver(parseWalletInput(`wsh(multi(1,${A}/*,${B}/0/0/*))`));
    const scripts = new Set([
      sorted('receive', 0).script,
      ordered('receive', 0).script,
      reordered('receive', 0).script,
    ]);
    // Sorting matches exactly one of the two orders.
    expect(scripts.size).toBe(2);
  });

  it('supports <0;1> on every key', () => {
    const wallet = parseWalletInput(`wsh(sortedmulti(2,${A}/<0;1>/*,${B}/<0;1>/*))`);
    expect(wallet.hasChange).toBe(true);
    const derive = scriptDeriver(wallet);
    expect(derive('receive', 0).script).not.toBe(derive('change', 0).script);
  });
});

describe('BIP380 checksum', () => {
  it('matches the BIP vector', () => {
    expect(descriptorChecksum('raw(deadbeef)')).toBe('89f8spxm');
    expect(verifyDescriptorChecksum('raw(deadbeef)#89f8spxm')).toBe(true);
    expect(verifyDescriptorChecksum('raw(deedbeef)#89f8spxm')).toBe(false);
    expect(verifyDescriptorChecksum('raw(deadbeef)#89f8spx')).toBe(false);
  });

  it('rejects a descriptor whose checksum does not match', () => {
    const good = parseWalletInput(BIP84_ZPUB).canonical;
    const bad = `${good.slice(0, -1)}${good.endsWith('q') ? 'p' : 'q'}`;
    expect(() => parseWalletInput(bad)).toThrow(/checksum/);
  });
});

describe('refusals', () => {
  it('refuses private keys', () => {
    expect(() => parseWalletInput(BIP84_ZPRV)).toThrow(/private key/);
    expect(() => parseWalletInput(`wpkh(${BIP84_ZPRV}/<0;1>/*)`)).toThrow(/private key/);
  });

  it('needs a script type for a bare xpub', () => {
    expect(() => parseWalletInput(BIP86_XPUB)).toThrow(/script type/);
  });

  it('refuses a script type that contradicts the prefix', () => {
    expect(() => parseWalletInput(BIP84_ZPUB, 'tr')).toThrow(DescriptorError);
  });

  it('refuses hardened steps after the xpub', () => {
    expect(() => parseWalletInput(`wpkh(${BIP86_XPUB}/0h/*)`)).toThrow(/Hardened/);
  });

  it('refuses unranged keys and single public keys', () => {
    expect(() => parseWalletInput(`wpkh(${BIP86_XPUB}/0)`)).toThrow(/ranged/);
    expect(() =>
      parseWalletInput('wpkh(0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c)')
    ).toThrow(/extended public keys/);
  });

  it('refuses taproot script trees and unsupported descriptors', () => {
    expect(() => parseWalletInput(`tr(${BIP86_XPUB}/<0;1>/*,{pk(${BIP86_XPUB}/*)})`)).toThrow(
      /script paths/
    );
    expect(() => parseWalletInput(`sh(multi(1,${BIP86_XPUB}/*))`)).toThrow(DescriptorError);
  });

  it('refuses a bad threshold', () => {
    expect(() => parseWalletInput(`wsh(multi(3,${BIP86_XPUB}/*,${BIP86_XPUB}/1/*))`)).toThrow(
      /threshold/
    );
  });

  it('refuses garbage', () => {
    expect(() => parseWalletInput('not a key')).toThrow(DescriptorError);
    expect(() => parseWalletInput('')).toThrow(DescriptorError);
  });
});

describe('electrumScriptHash', () => {
  it('is the reversed SHA-256 of the script', () => {
    // Electrum protocol docs example: P2PKH for 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa.
    expect(electrumScriptHash('76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac')).toBe(
      '8b01df4e368ea28f8dc0423bcf7a4923e3a12d307c875e47a0cfbf90b5c39161'
    );
  });
});
