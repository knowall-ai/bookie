import 'server-only';
import { randomUUID } from 'node:crypto';
import { assertCanManageSettings } from '@/lib/auth/access';
import type { AuthContext } from '@/lib/auth/context';
import { configStoreFor, type BitcoinWalletRecord } from '@/lib/config';
import { listOrgs } from '@/lib/connectors/registry';
import type {
  AccountingConnector,
  SourceBitcoinWallet,
  SourceBitcoinWallets,
} from '@/lib/connectors/types';
import type { IsoDate, OrgRef } from '@/lib/domain/types';
import { WalletError } from './errors';
import {
  DEMO_LATEST_RATE,
  DEMO_WALLET_BC_BANK,
  DEMO_WALLET_ID,
  DEMO_WALLET_ORG,
  demoRates,
  demoWalletScan,
} from './demo';
import {
  describeWallet,
  parseWalletInput,
  type Network,
  type ScriptType,
  type WalletDescriptor,
} from './descriptor';
import { ElectrumClient, ElectrumError, parseElectrumUrl, type ElectrumServer } from './electrum';
import { ratesForBlockTimes, valueFor, valueNow, type FiatValue } from './kraken';
import { scanWallet, type ChainTransaction, type WalletScan } from './scan';

/* ------------------------------------------------------------------ */
/* Electrum server configuration                                       */
/* ------------------------------------------------------------------ */

type Env = Record<string, string | undefined>;

export type ElectrumSetting =
  | { configured: true; server: ElectrumServer; trusted: boolean; certSha256?: string }
  | { configured: false; error?: string };

export const NO_ELECTRUM = 'No Electrum server configured';

/**
 * BOOKIE_ELECTRUM_URL: `ssl://host:port` or `tcp://host:port`.
 * BOOKIE_ELECTRUM_TRUSTED=1: the operator runs this server (no privacy warning).
 * BOOKIE_ELECTRUM_CERT_SHA256: pin a self-signed certificate.
 */
export function electrumSetting(env: Env = process.env): ElectrumSetting {
  const url = env.BOOKIE_ELECTRUM_URL?.trim();
  if (!url) return { configured: false };
  try {
    const certSha256 = env.BOOKIE_ELECTRUM_CERT_SHA256?.trim() || undefined;
    if (certSha256 && !/^([0-9a-fA-F]{2}:?){32}$/.test(certSha256)) {
      return {
        configured: false,
        error: 'BOOKIE_ELECTRUM_CERT_SHA256 must be a SHA-256 fingerprint.',
      };
    }
    return {
      configured: true,
      server: parseElectrumUrl(url),
      trusted: env.BOOKIE_ELECTRUM_TRUSTED === '1',
      certSha256,
    };
  } catch (error) {
    return { configured: false, error: (error as Error).message };
  }
}

/** What the UI may say about the server: never its address. */
export interface ElectrumStatus {
  configured: boolean;
  /** A server the operator hasn't marked as their own: it sees which addresses are asked about. */
  privacyWarning: boolean;
  plaintext: boolean;
  error?: string;
}

export function electrumStatus(env: Env = process.env): ElectrumStatus {
  const setting = electrumSetting(env);
  if (!setting.configured) {
    return { configured: false, privacyWarning: false, plaintext: false, error: setting.error };
  }
  return {
    configured: true,
    privacyWarning: !setting.trusted,
    plaintext: setting.server.protocol === 'tcp',
  };
}

/* ------------------------------------------------------------------ */
/* Wallets                                                             */
/* ------------------------------------------------------------------ */

/**
 * Where a wallet's descriptor lives:
 * - `business-central`: on the BC Bank Account (Bookie Bitcoin extension), read live;
 * - `bookie`: sealed in the customer's SharePoint (organisations whose books can't hold it, e.g. Xero);
 * - `demo`: the demo organisation's fictional fixtures.
 */
export type WalletSource = 'business-central' | 'bookie' | 'demo';

/** A wallet as the UI sees it: never the descriptor or any address. */
export interface WalletSummary {
  id: string;
  name: string;
  orgKey: string;
  source: WalletSource;
  /** Undefined when the descriptor can't be used (see `problem`). */
  type?: ScriptType;
  /** "Native SegWit (P2WPKH)", "2-of-3 multisig (P2WSH)". */
  typeLabel: string;
  network?: Network;
  hasChange: boolean;
  /** The BC bank account it is (BC) or reconciles to (demo). */
  bcBankAccountNumber?: string;
  bcBankAccountId?: string;
  /** The BC bank account's currency code ('' = the company's LCY). */
  currencyCode?: string;
  createdBy?: string;
  createdAt?: string;
  /** Why this wallet can't be read, e.g. an invalid descriptor typed into BC. */
  problem?: string;
  /** The demo organisation's fictional wallet. */
  demo?: boolean;
}

/** The organisation a wallet belongs to, resolved by the caller with orgContext(). */
export interface WalletScope {
  org: Pick<OrgRef, 'key' | 'kind'>;
  connector?: Pick<AccountingConnector, 'bitcoin'>;
}

export interface OrgWallets {
  wallets: WalletSummary[];
  /** Business Central: why Bookie can't read its wallets (extension missing, no permission). */
  unavailable?: string;
}

const DEMO_RECORD: WalletSummary = {
  id: DEMO_WALLET_ID,
  name: 'Contoso Treasury',
  orgKey: DEMO_WALLET_ORG,
  source: 'demo',
  type: 'wpkh',
  typeLabel: describeWallet({ type: 'wpkh', keys: [] }),
  network: 'mainnet',
  hasChange: true,
  bcBankAccountNumber: DEMO_WALLET_BC_BANK,
  currencyCode: 'BTC',
  createdBy: 'alex.morgan@contoso.example',
  createdAt: '2026-08-01T09:00:00.000Z',
  demo: true,
};

const BC_PREFIX = 'bc~';

function summariseRecord(record: BitcoinWalletRecord): WalletSummary {
  const parsed = parseWalletInput(record.descriptor);
  return {
    id: record.id,
    name: record.name,
    orgKey: record.orgKey,
    source: 'bookie',
    type: parsed.type,
    typeLabel: describeWallet(parsed),
    network: parsed.network,
    hasChange: parsed.hasChange,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  };
}

/** A BC bank account with a descriptor, parsed; an unusable descriptor becomes a `problem`. */
export function fromSourceWallet(
  orgKey: string,
  source: SourceBitcoinWallet
): { summary: WalletSummary; descriptor?: WalletDescriptor } {
  const base = {
    id: `${BC_PREFIX}${source.bankAccountId}`,
    name: source.name,
    orgKey,
    source: 'business-central' as const,
    bcBankAccountNumber: source.bankAccountNumber,
    bcBankAccountId: source.bankAccountId,
    currencyCode: source.currencyCode,
  };
  try {
    const descriptor = parseWalletInput(source.descriptor, source.scriptType);
    return {
      summary: {
        ...base,
        type: descriptor.type,
        typeLabel: describeWallet(descriptor),
        network: descriptor.network,
        hasChange: descriptor.hasChange,
      },
      descriptor,
    };
  } catch (error) {
    if (!(error instanceof WalletError)) throw error;
    return {
      summary: {
        ...base,
        typeLabel: 'Descriptor not usable',
        hasChange: false,
        problem: `The Bitcoin wallet descriptor on bank account ${source.bankAccountNumber} in Business Central can't be used: ${error.message}`,
      },
    };
  }
}

/**
 * The source's wallets, once per connector. Connectors are built per request, so a
 * page that lists wallets and then loads each one asks Business Central once.
 */
const sourceWalletCache = new WeakMap<object, Promise<SourceBitcoinWallets>>();
function sourceWallets(scope: WalletScope): Promise<SourceBitcoinWallets> | undefined {
  const walletsModule = scope.connector?.bitcoin;
  if (!walletsModule) return undefined;
  let hit = sourceWalletCache.get(walletsModule);
  if (!hit) {
    hit = walletsModule.wallets();
    sourceWalletCache.set(walletsModule, hit);
  }
  return hit;
}

async function records(auth: AuthContext): Promise<BitcoinWalletRecord[]> {
  return configStoreFor(auth).listWallets();
}

/**
 * Wallets kept in Bookie's sealed settings (Settings › Bitcoin wallets, members only),
 * with the demo wallet in demo mode. Business Central wallets live in BC instead.
 */
export async function listWallets(auth: AuthContext): Promise<WalletSummary[]> {
  assertCanManageSettings(auth.user);
  const stored = (await records(auth)).map(summariseRecord);
  return auth.mode === 'demo' ? [DEMO_RECORD, ...stored] : stored;
}

/** Wallets shown in one organisation. The caller has already resolved it with orgContext(). */
export async function walletsForOrg(auth: AuthContext, scope: WalletScope): Promise<OrgWallets> {
  if (scope.org.kind === 'business-central') {
    const result = await sourceWallets(scope);
    if (!result) return { wallets: [] };
    if (result.status === 'unavailable') return { wallets: [], unavailable: result.reason };
    return { wallets: result.wallets.map((w) => fromSourceWallet(scope.org.key, w).summary) };
  }
  const stored = (await records(auth))
    .filter((r) => r.orgKey === scope.org.key)
    .map(summariseRecord);
  const demo = auth.mode === 'demo' && scope.org.key === DEMO_WALLET_ORG ? [DEMO_RECORD] : [];
  return { wallets: [...demo, ...stored] };
}

interface ResolvedWallet {
  summary: WalletSummary;
  descriptor?: WalletDescriptor;
}

async function resolveWallet(
  auth: AuthContext,
  scope: WalletScope,
  id: string
): Promise<ResolvedWallet> {
  const notFound = () => new WalletError('Wallet not found.', 404);
  if (scope.org.kind === 'business-central') {
    if (!id.startsWith(BC_PREFIX)) throw notFound();
    const result = await sourceWallets(scope);
    if (!result) throw notFound();
    if (result.status === 'unavailable') throw new WalletError(result.reason, 404);
    const source = result.wallets.find((w) => `${BC_PREFIX}${w.bankAccountId}` === id);
    if (!source) throw notFound();
    return fromSourceWallet(scope.org.key, source);
  }
  if (auth.mode === 'demo' && id === DEMO_WALLET_ID && scope.org.key === DEMO_WALLET_ORG) {
    return { summary: DEMO_RECORD };
  }
  const record = (await records(auth)).find((r) => r.id === id && r.orgKey === scope.org.key);
  if (!record) throw notFound();
  return { summary: summariseRecord(record), descriptor: parseWalletInput(record.descriptor) };
}

/** The setup guide (the extension, permission sets, BTC currency and bank account). */
export const BITCOIN_DOCS = 'https://github.com/knowall-ai/bookie/blob/main/docs/BITCOIN.adoc';

export const BC_WALLETS_IN_BC =
  'For Business Central, put the wallet’s xpub or descriptor on the bank account in Business Central (Bookie Bitcoin extension, see docs/BITCOIN.adoc). Bookie reads it from there.';

export interface AddWalletInput {
  name: string;
  orgKey: string;
  /** xpub/ypub/zpub or an output descriptor. */
  key: string;
  scriptType?: ScriptType;
}

export async function addWallet(auth: AuthContext, input: AddWalletInput): Promise<WalletSummary> {
  assertCanManageSettings(auth.user);
  // The organisation must be one this member can open.
  const { orgs } = await listOrgs(auth);
  const org = orgs.find((o) => o.key === input.orgKey);
  if (!org) throw new WalletError('Organisation not found.', 404);
  if (org.kind === 'business-central') throw new WalletError(BC_WALLETS_IN_BC, 400);
  const parsed = parseWalletInput(input.key, input.scriptType);
  const store = configStoreFor(auth);
  const existing = await store.listWallets();
  if (existing.some((w) => w.descriptor === parsed.canonical)) {
    throw new WalletError('That wallet has already been added.', 409);
  }
  if (existing.length >= 50) throw new WalletError('Bookie allows up to 50 wallets.', 400);
  const record: BitcoinWalletRecord = {
    id: randomUUID(),
    name: input.name,
    orgKey: input.orgKey,
    descriptor: parsed.canonical,
    createdBy: auth.user.email || auth.user.id,
    createdAt: new Date().toISOString(),
  };
  await store.saveWallet(record);
  return summariseRecord(record);
}

export async function removeWallet(auth: AuthContext, id: string): Promise<void> {
  assertCanManageSettings(auth.user);
  await configStoreFor(auth).deleteWallet(id);
  for (const key of scans.keys()) {
    if (key.startsWith(`${auth.user.tenantId}:`) && key.includes(`:${id}:`)) scans.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* Chain data: live, with a short in-memory cache per tenant + wallet  */
/* ------------------------------------------------------------------ */

export type WalletLoad =
  | { status: 'ok'; scan: WalletScan; source: 'electrum' | 'demo'; electrum?: ElectrumStatus }
  | { status: 'not-configured'; message: string }
  | { status: 'error'; message: string };

const SCAN_TTL_MS = 60_000;
const scans = new Map<string, { at: number; value: Promise<WalletScan> }>();

/** Tenant, organisation, wallet and descriptor: a descriptor changed in BC is never served stale. */
const cacheKey = (auth: AuthContext, orgKey: string, walletId: string, d: WalletDescriptor) =>
  `${auth.user.tenantId}:${orgKey}:${walletId}:${d.canonical.slice(-8)}`;

async function liveScan(
  descriptor: WalletDescriptor,
  setting: Extract<ElectrumSetting, { configured: true }>
) {
  const client = await ElectrumClient.connect(setting.server, { certSha256: setting.certSha256 });
  try {
    return await scanWallet(descriptor, client);
  } finally {
    client.close();
  }
}

export async function loadWallet(
  auth: AuthContext,
  scope: WalletScope,
  walletId: string
): Promise<{ wallet: WalletSummary; load: WalletLoad }> {
  const { summary, descriptor } = await resolveWallet(auth, scope, walletId);
  return { wallet: summary, load: await loadResolved(auth, scope, summary, descriptor) };
}

/** Load a wallet already listed by walletsForOrg (the bank page's cards). */
export async function loadWalletSummary(
  auth: AuthContext,
  scope: WalletScope,
  summary: WalletSummary
): Promise<WalletLoad> {
  if (summary.demo || summary.problem) return loadResolved(auth, scope, summary);
  return (await loadWallet(auth, scope, summary.id)).load;
}

async function loadResolved(
  auth: AuthContext,
  scope: WalletScope,
  summary: WalletSummary,
  descriptor?: WalletDescriptor
): Promise<WalletLoad> {
  if (summary.demo) return { status: 'ok', scan: demoWalletScan(), source: 'demo' };
  if (summary.problem || !descriptor) {
    return { status: 'error', message: summary.problem ?? 'This wallet has no descriptor.' };
  }
  const setting = electrumSetting();
  if (!setting.configured) {
    return { status: 'not-configured', message: setting.error ?? NO_ELECTRUM };
  }
  if (descriptor.network !== 'mainnet') {
    return {
      status: 'error',
      message: 'This is a testnet wallet; Bookie reads mainnet wallets only.',
    };
  }
  const key = cacheKey(auth, scope.org.key, summary.id, descriptor);
  const now = Date.now();
  let hit = scans.get(key);
  if (!hit || now - hit.at > SCAN_TTL_MS) {
    hit = { at: now, value: liveScan(descriptor, setting) };
    scans.set(key, hit);
    if (scans.size > 500) scans.delete(scans.keys().next().value!);
    const value = hit.value;
    value.catch(() => {
      if (scans.get(key)?.value === value) scans.delete(key);
    });
  }
  try {
    return { status: 'ok', scan: await hit.value, source: 'electrum', electrum: electrumStatus() };
  } catch (error) {
    const message =
      error instanceof ElectrumError
        ? error.message
        : 'Bookie could not read this wallet from the Electrum server.';
    if (!(error instanceof ElectrumError)) console.error('[bookie] wallet scan failed', error);
    return { status: 'error', message };
  }
}

/** Forget cached scans (tests). */
export function clearWalletScans() {
  scans.clear();
}

/* ------------------------------------------------------------------ */
/* Values in the organisation's base currency                          */
/* ------------------------------------------------------------------ */

export interface WalletTransactionRow extends ChainTransaction {
  /** UTC date of the block. */
  date?: IsoDate;
  value: FiatValue;
}

export const PENDING_VALUE_REASON = 'Pending: it has no block time yet, so it has no rate.';

/**
 * Each transaction valued in `currency` (the organisation's base currency, from its
 * books; undefined = not available) at Kraken's price for its block, or the reason.
 */
export async function valueTransactions(
  transactions: ChainTransaction[],
  source: 'electrum' | 'demo',
  currency: string | undefined
): Promise<WalletTransactionRow[]> {
  const times = transactions.flatMap((t) => (t.blockTime ? [t.blockTime] : []));
  const rates =
    source === 'demo' ? demoRates(times, currency) : await ratesForBlockTimes(times, currency);
  return transactions.map((t) => {
    const rate = t.blockTime ? rates.get(t.blockTime) : undefined;
    const value: FiatValue = !t.blockTime
      ? { ok: false, reason: PENDING_VALUE_REASON }
      : typeof rate === 'object'
        ? valueFor(t.netSats, rate)
        : { ok: false, reason: rate ?? 'Kraken prices are unavailable.' };
    return {
      ...t,
      date: t.blockTime ? new Date(t.blockTime * 1000).toISOString().slice(0, 10) : undefined,
      value,
    };
  });
}

/** The confirmed balance in `currency` at Kraken's latest trade. */
export async function valueBalance(
  sats: number,
  source: 'electrum' | 'demo',
  currency: string | undefined
): Promise<FiatValue> {
  if (source === 'demo') {
    return currency === DEMO_LATEST_RATE.currency
      ? valueFor(sats, DEMO_LATEST_RATE)
      : { ok: false, reason: `The demo has prices in ${DEMO_LATEST_RATE.currency} only.` };
  }
  return valueNow(sats, currency);
}

/** The organisation's base currency as its books report it, or undefined (never guessed). */
export async function baseCurrencyOf(connector: {
  organisation(): Promise<{ baseCurrency?: string }>;
}): Promise<string | undefined> {
  try {
    return (await connector.organisation()).baseCurrency?.trim().toUpperCase() || undefined;
  } catch {
    return undefined;
  }
}
