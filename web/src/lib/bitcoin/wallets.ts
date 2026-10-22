import 'server-only';
import { cache } from 'react';
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
import { validateOrgElectrumUrl } from './electrum-guard';
import {
  DEMO_LATEST_RATE,
  DEMO_WALLET_BC_BANK,
  DEMO_WALLET_ID,
  DEMO_WALLET_ZPUB,
  DEMO_WALLET_ORG,
  demoDailyRates,
  demoRates,
  demoWalletScan,
} from './demo';
import {
  describeWallet,
  parseWalletInput,
  scriptDeriver,
  type Network,
  type ScriptType,
  type WalletDescriptor,
} from './descriptor';
import { ElectrumClient, ElectrumError, parseElectrumUrl, type ElectrumServer } from './electrum';
import {
  ratesForBlockTimes,
  ratesForDays,
  valueFor,
  valueNow,
  type FiatRate,
  type FiatValue,
} from './kraken';
import { dailyBalances } from './history';
import {
  firstUnusedReceiveIndex,
  scanWallet,
  type ChainTransaction,
  type WalletScan,
} from './scan';

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

/**
 * The Electrum server in effect for this tenant. Memoised per request (React `cache`, keyed by
 * the request's memoised AuthContext), so a page with several wallet cards reads the sealed
 * settings once rather than per card.
 */
export const electrumSettingFor = cache(async function electrumSettingFor(
  auth: AuthContext
): Promise<ElectrumSetting & { source?: 'organisation' | 'installation' }> {
  const own = (await configStoreFor(auth).getSettings()).bitcoin?.electrum;
  if (!own) return { ...electrumSetting(), source: 'installation' };
  try {
    if (own.certSha256 && !/^([0-9a-fA-F]{2}:?){32}$/.test(own.certSha256))
      throw new Error('Use a SHA-256 certificate fingerprint.');
    return {
      configured: true,
      server: validateOrgElectrumUrl(own.url),
      trusted: own.trusted,
      certSha256: own.certSha256,
      source: 'organisation',
    };
  } catch (error) {
    return { configured: false, error: (error as Error).message, source: 'organisation' };
  }
});

export async function electrumStatusFor(auth: AuthContext): Promise<ElectrumStatus> {
  const setting = await electrumSettingFor(auth);
  return {
    configured: setting.configured,
    privacyWarning: setting.configured && !setting.trusted,
    plaintext: setting.configured && setting.server.protocol === 'tcp',
    source: setting.source,
    ...(setting.configured
      ? {
          url:
            setting.source === 'organisation'
              ? `ssl://${setting.server.host.includes(':') ? `[${setting.server.host}]` : setting.server.host}:${setting.server.port}`
              : undefined,
        }
      : { error: setting.error }),
  };
}

/** Only an organisation's own server address may be shown in the UI. */
export interface ElectrumStatus {
  source?: 'organisation' | 'installation';
  url?: string;
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

/** A sealed record as a summary; a record that no longer parses becomes a `problem`, never a crash. */
function summariseRecord(record: BitcoinWalletRecord): WalletSummary {
  const base = {
    id: record.id,
    name: record.name,
    orgKey: record.orgKey,
    source: 'bookie' as const,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  };
  try {
    const parsed = parseWalletInput(record.descriptor);
    return {
      ...base,
      type: parsed.type,
      typeLabel: describeWallet(parsed),
      network: parsed.network,
      hasChange: parsed.hasChange,
    };
  } catch (error) {
    if (!(error instanceof WalletError)) throw error;
    return {
      ...base,
      typeLabel: 'Descriptor not usable',
      hasChange: false,
      problem: `This wallet's stored key can't be used (${error.message}). Remove it and add it again.`,
    };
  }
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
    return { summary: DEMO_RECORD, descriptor: parseWalletInput(DEMO_WALLET_ZPUB) };
  }
  const record = (await records(auth)).find((r) => r.id === id && r.orgKey === scope.org.key);
  if (!record) throw notFound();
  const summary = summariseRecord(record);
  return { summary, descriptor: summary.problem ? undefined : parseWalletInput(record.descriptor) };
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

// Chain history changes only when a block lands or a payment arrives; five minutes keeps
// repeated page views from re-reading a large wallet.
const SCAN_TTL_MS = 5 * 60_000;
const scans = new Map<string, { at: number; value: Promise<WalletScan> }>();

/** Tenant, organisation, wallet and descriptor: a descriptor changed in BC is never served stale. */
export const cacheKey = (
  auth: AuthContext,
  orgKey: string,
  walletId: string,
  d: WalletDescriptor,
  server: ElectrumServer
) =>
  `${auth.user.tenantId}:${orgKey}:${walletId}:${d.canonical.slice(-8)}:${server.protocol}://${server.host}:${server.port}`;

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
  const setting = await electrumSettingFor(auth);
  if (!setting.configured) {
    return { status: 'not-configured', message: setting.error ?? NO_ELECTRUM };
  }
  if (descriptor.network !== 'mainnet') {
    return {
      status: 'error',
      message: 'This is a testnet wallet; Bookie reads mainnet wallets only.',
    };
  }
  const key = cacheKey(auth, scope.org.key, summary.id, descriptor, setting.server);
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
    return {
      status: 'ok',
      scan: await hit.value,
      source: 'electrum',
      electrum: await electrumStatusFor(auth),
    };
  } catch (error) {
    return { status: 'error', message: chainErrorMessage(error) };
  }
}

/**
 * ElectrumError and WalletError messages are fixed sentences, safe to show; the
 * socket or server detail (which can name the host) goes to the server log only.
 */
function chainErrorMessage(error: unknown): string {
  if (error instanceof ElectrumError) {
    console.error('[bookie] wallet scan failed:', error.message, error.detail ?? '');
    return error.message;
  }
  if (error instanceof WalletError) return error.message;
  console.error('[bookie] wallet scan failed', error);
  return 'Bookie could not read this wallet from the Electrum server.';
}

/* ------------------------------------------------------------------ */
/* Receiving a payment                                                 */
/* ------------------------------------------------------------------ */

export type ReceiveAddress =
  | { ok: true; address: string; index: number; network: Network; demo?: boolean }
  | { ok: false; reason: string; network?: Network };

/**
 * A fresh receive address: derived here from the wallet's descriptor at the scan's
 * `nextReceiveIndex` (never an index from the browser). Without a live scan Bookie
 * can't know which addresses are used, so it gives the reason, never a guessed address.
 */
export async function receiveAddress(
  auth: AuthContext,
  scope: WalletScope,
  walletId: string
): Promise<ReceiveAddress> {
  const { summary, descriptor } = await resolveWallet(auth, scope, walletId);
  const network = descriptor?.network ?? summary.network;
  const load = await loadResolved(auth, scope, summary, descriptor);
  const unavailable = (message: string): ReceiveAddress => ({
    ok: false,
    reason: `Can’t pick an unused address without reading the chain: ${message}`,
    network,
  });
  if (load.status !== 'ok') return unavailable(load.message);
  if (!descriptor) return unavailable(summary.problem ?? 'This wallet has no descriptor.');
  let index = load.scan.nextReceiveIndex;
  const setting = await electrumSettingFor(auth);
  if (load.source === 'electrum' && setting.configured) {
    // The scan may be from the cache: check the chain now, so an address paid in the
    // last few minutes isn't offered again.
    try {
      const client = await ElectrumClient.connect(setting.server, {
        certSha256: setting.certSha256,
      });
      try {
        index = await firstUnusedReceiveIndex(descriptor, client, index);
      } finally {
        client.close();
      }
    } catch (error) {
      return unavailable(chainErrorMessage(error));
    }
  }
  const { address } = scriptDeriver(descriptor)('receive', index);
  return { ok: true, address, index, network: descriptor.network, demo: summary.demo };
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

/** What the balance panel (card and wallet page) shows, in BTC and in the base currency. */
export interface BalanceView {
  /** The organisation's base currency, or undefined when its books don't say. */
  currency?: string;
  confirmedSats: number;
  pendingSats: number;
  /** The confirmed balance now, in `currency`, or the reason there's no value. */
  now: FiatValue;
  /** End-of-day confirmed balances; `value` only where a price for that day exists. */
  series: { date: string; sats: number; value?: number; rateLabel?: string }[];
  /** Where the chart's currency values come from, or why there are none. */
  seriesSource: string;
  hasSeriesValues: boolean;
  /** When the chain was last read, and the block it was read at. */
  checkedAt: string;
  tipHeight: number;
}

const valueOf = (sats: number, rate: FiatRate): number | undefined => {
  const value = valueFor(sats, rate);
  return value.ok ? value.amount : undefined;
};

export async function balanceView(
  scan: WalletScan,
  source: 'electrum' | 'demo',
  currency: string | undefined,
  days: number
): Promise<BalanceView> {
  const points = dailyBalances(scan.balance.confirmedSats, scan.transactions, days);
  const dates = points.map((p) => p.date);
  const [now, rates] = await Promise.all([
    valueBalance(scan.balance.confirmedSats, source, currency),
    source === 'demo' ? demoDailyRates(dates, currency) : ratesForDays(dates, currency),
  ]);
  const series = points.map((p) => {
    const rate = typeof rates === 'string' ? undefined : rates.get(p.date);
    return rate ? { ...p, value: valueOf(p.sats, rate), rateLabel: rate.label } : p;
  });
  const hasSeriesValues = series.some((p) => 'value' in p && p.value !== undefined);
  const pair = currency ? `XBT${currency}` : '';
  return {
    currency,
    confirmedSats: scan.balance.confirmedSats,
    pendingSats: scan.balance.pendingSats,
    now,
    series,
    seriesSource:
      typeof rates === 'string'
        ? rates
        : source === 'demo'
          ? 'Each day at a demo price (fictional).'
          : hasSeriesValues
            ? `Each day at Kraken's ${pair} daily close; today at Kraken's last trade.`
            : `Kraken has no ${pair} prices for these days.`,
    hasSeriesValues,
    checkedAt: scan.scannedAt,
    tipHeight: scan.tip.height,
  };
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
