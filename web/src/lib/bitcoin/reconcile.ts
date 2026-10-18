/**
 * Reconcile a wallet's chain history against the posted bank ledger of the BTC bank
 * account it reconciles to. Pure functions, so the rules are unit tested on their own.
 *
 * 1. By txid: a ledger entry whose External Document No. is the start of the txid (BC
 *    holds 35 characters, upper-cased), or whose description contains the full txid.
 *    Every entry for that txid is grouped; if their sum differs from the chain amount,
 *    the match says so.
 * 2. Then by exact amount, in satoshis, within a date window (default 3 days either
 *    side of the block's UTC date), nearest date first; each entry is used once.
 * 3. What is left: on chain but not in the books, and in the books but not on chain.
 *
 * Pending transactions are never matched by amount (they haven't settled) and are
 * never drafted; they are listed apart.
 */
import type { BtcJournalLine, BtcLedgerEntry } from '@/lib/connectors/types';
import type { IsoDate } from '@/lib/domain/types';
import { satsToBtc } from './format';
import type { ChainTransaction, WalletScan } from './scan';

export const DEFAULT_WINDOW_DAYS = 3;
/** BC's External Document No. is Code[35]. */
export const EXTERNAL_DOC_LENGTH = 35;
/** A shorter reference is too weak to identify a txid. */
const MIN_TXID_PREFIX = 20;

export interface ReconcileTx extends ChainTransaction {
  /** UTC date of the block (undefined while pending). */
  date?: IsoDate;
}

export interface MatchedTx {
  tx: ReconcileTx;
  entries: BtcLedgerEntry[];
  by: 'txid' | 'amount';
  /** Txid matches, but the entries' total isn't the chain amount. */
  amountDiffers: boolean;
  ledgerSats: number;
}

export interface ReconcileResult {
  matched: MatchedTx[];
  /** Confirmed on chain, no entry in the books. */
  chainOnly: ReconcileTx[];
  /** Unconfirmed: not settled, so not reconciled yet (matched by txid if the books already have it). */
  pending: ReconcileTx[];
  /** In the books, not on chain. */
  ledgerOnly: BtcLedgerEntry[];
}

export function txDate(tx: ChainTransaction): IsoDate | undefined {
  return tx.blockTime ? new Date(tx.blockTime * 1000).toISOString().slice(0, 10) : undefined;
}

/** The txid this entry refers to, among the given ones. */
export function entryTxid(entry: BtcLedgerEntry, txids: string[]): string | undefined {
  const ref = entry.externalDocumentNumber?.trim().toLowerCase() ?? '';
  if (ref.length >= MIN_TXID_PREFIX && /^[0-9a-f]+$/.test(ref)) {
    const hit = txids.find((id) => id.startsWith(ref));
    if (hit) return hit;
  }
  const text = entry.description?.toLowerCase() ?? '';
  if (text.length >= 64) return txids.find((id) => text.includes(id));
  return undefined;
}

const dayDiff = (a: IsoDate, b: IsoDate) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

export function reconcile(
  transactions: ChainTransaction[],
  entries: BtcLedgerEntry[],
  options: { windowDays?: number } = {}
): ReconcileResult {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const txs: ReconcileTx[] = transactions.map((t) => ({ ...t, date: txDate(t) }));
  const txids = txs.map((t) => t.txid);
  const used = new Set<string>();
  const byTxid = new Map<string, BtcLedgerEntry[]>();

  for (const entry of entries) {
    const txid = entryTxid(entry, txids);
    if (!txid) continue;
    byTxid.set(txid, [...(byTxid.get(txid) ?? []), entry]);
    used.add(entry.id);
  }

  const matched: MatchedTx[] = [];
  const chainOnly: ReconcileTx[] = [];
  const pending: ReconcileTx[] = [];

  // Oldest first, so the amount match takes the earliest plausible entry.
  const ordered = [...txs].sort((a, b) => (a.blockTime ?? Infinity) - (b.blockTime ?? Infinity));
  for (const tx of ordered) {
    const linked = byTxid.get(tx.txid);
    if (linked) {
      const ledgerSats = linked.reduce((s, e) => s + e.amountSats, 0);
      matched.push({
        tx,
        entries: linked,
        by: 'txid',
        amountDiffers: ledgerSats !== tx.netSats,
        ledgerSats,
      });
      continue;
    }
    if (tx.pending || !tx.date) {
      pending.push(tx);
      continue;
    }
    const candidates = entries
      .filter(
        (e) =>
          !used.has(e.id) &&
          e.amountSats === tx.netSats &&
          dayDiff(e.postingDate, tx.date!) <= windowDays
      )
      .sort(
        (a, b) =>
          dayDiff(a.postingDate, tx.date!) - dayDiff(b.postingDate, tx.date!) ||
          (a.entryNumber ?? 0) - (b.entryNumber ?? 0) ||
          a.id.localeCompare(b.id)
      );
    const entry = candidates[0];
    if (entry) {
      used.add(entry.id);
      matched.push({
        tx,
        entries: [entry],
        by: 'amount',
        amountDiffers: false,
        ledgerSats: entry.amountSats,
      });
    } else {
      chainOnly.push(tx);
    }
  }

  const newestFirst = (a: ReconcileTx, b: ReconcileTx) =>
    (b.blockTime ?? Infinity) - (a.blockTime ?? Infinity);
  return {
    matched: matched.sort((a, b) => newestFirst(a.tx, b.tx)),
    chainOnly: chainOnly.sort(newestFirst),
    pending,
    ledgerOnly: entries
      .filter((e) => !used.has(e.id))
      .sort((a, b) => b.postingDate.localeCompare(a.postingDate)),
  };
}

/* ------------------------------------------------------------------ */
/* Drafting journal lines                                              */
/* ------------------------------------------------------------------ */

export class DraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftError';
  }
}

/** BC Document No. (Code[20]): one per transaction. */
export function btcDocumentNumber(txid: string): string {
  return `BTC-${txid.slice(0, 12).toUpperCase()}`;
}

/**
 * The journal lines for one confirmed on-chain transaction:
 * - money in: the bank line for the amount, against the counter account;
 * - money out: the payment (amount less fee) against the counter account, and the
 *   fee as its own line against the fee account;
 * - moved within the wallet: only the fee.
 * A send whose fee isn't the wallet's alone (others funded some inputs) is drafted as one line for
 * the whole amount, and its description says the fee isn't separated.
 */
export function journalLinesFor(
  tx: ReconcileTx,
  accounts: { bankAccountNumber: string; counterAccount: string; feeAccount?: string }
): BtcJournalLine[] {
  if (tx.pending || !tx.date)
    throw new DraftError('Pending transactions are not drafted until they confirm.');
  const base = {
    bankAccountNumber: accounts.bankAccountNumber,
    postingDate: tx.date,
    documentNumber: btcDocumentNumber(tx.txid),
    externalDocumentNumber: tx.txid.slice(0, EXTERNAL_DOC_LENGTH),
  };
  if (tx.netSats >= 0 && tx.direction !== 'self') {
    return [
      {
        ...base,
        description: `BTC ${tx.txid}`,
        amountSats: tx.netSats,
        balancingAccountNumber: accounts.counterAccount,
      },
    ];
  }
  if (tx.feeSats === undefined) {
    // A send whose fee isn't the wallet's alone (others funded inputs) or isn't known.
    return [
      {
        ...base,
        description: `BTC ${tx.txid} (fee not separated)`.slice(0, 100),
        amountSats: tx.netSats,
        balancingAccountNumber: accounts.counterAccount,
      },
    ];
  }
  if (!accounts.feeAccount) throw new DraftError('Choose an account for network fees.');
  const fee = {
    ...base,
    description: `BTC fee ${tx.txid}`,
    amountSats: -tx.feeSats,
    balancingAccountNumber: accounts.feeAccount,
  };
  const payment = tx.netSats + tx.feeSats;
  if (tx.direction === 'self' || payment === 0) return [fee];
  return [
    {
      ...base,
      description: `BTC ${tx.txid}`,
      amountSats: payment,
      balancingAccountNumber: accounts.counterAccount,
    },
    fee,
  ];
}

/* ------------------------------------------------------------------ */
/* The summary (Bookie's tool, the portal API and the agent's script)  */
/* ------------------------------------------------------------------ */

const btc = (sats: number) => Number(satsToBtc(sats).replace(/,/g, ''));

/**
 * The reconcile in plain figures: counts, then only what needs attention. Amounts are
 * BTC to 8 decimals, exactly as on chain and in the books; nothing is converted.
 */
export function summariseReconcile(input: {
  wallet: string;
  bankAccountNumber: string;
  scan: Pick<WalletScan, 'tip' | 'balance'>;
  result: ReconcileResult;
  ledgerSats: number;
  /** Txids on unposted drafts, or 'not available' when the drafts couldn't be read. */
  drafted?: string[] | 'not available';
}) {
  const { result, scan } = input;
  const draftsKnown = input.drafted !== 'not available';
  const drafted = new Set(draftsKnown ? ((input.drafted as string[] | undefined) ?? []) : []);
  const differs = result.matched.filter((m) => m.amountDiffers);
  return {
    wallet: input.wallet,
    bankAccount: input.bankAccountNumber,
    status: 'ok',
    readAtBlock: scan.tip.height,
    counts: {
      matched: result.matched.length,
      matchedButAmountsDiffer: differs.length,
      onChainNotInBooks: result.chainOnly.length,
      inBooksNotOnChain: result.ledgerOnly.length,
      pending: result.pending.length,
      draftedNotPosted: draftsKnown ? drafted.size : ('not available' as const),
    },
    balances: {
      onChainConfirmedBtc: btc(scan.balance.confirmedSats),
      inBooksBtc: btc(input.ledgerSats),
      differenceBtc: btc(scan.balance.confirmedSats - input.ledgerSats),
      note: 'In the books = the sum of posted entries on the bank account. The chain figure is confirmed only; a pending transaction the books already have is in the books figure but not yet the chain one.',
    },
    onChainNotInBooks: result.chainOnly.map((t) => ({
      txid: t.txid,
      date: t.date,
      amountBtc: btc(t.netSats),
      feeBtc: t.feeSats === undefined ? undefined : btc(t.feeSats),
      drafted: draftsKnown ? drafted.has(t.txid) : ('not available' as const),
    })),
    inBooksNotOnChain: result.ledgerOnly.map((e) => ({
      postingDate: e.postingDate,
      documentNumber: e.documentNumber,
      externalDocumentNumber: e.externalDocumentNumber,
      description: e.description,
      amountBtc: btc(e.amountSats),
    })),
    amountsDiffer: differs.map((m) => ({
      txid: m.tx.txid,
      onChainBtc: btc(m.tx.netSats),
      inBooksBtc: btc(m.ledgerSats),
    })),
    pending: result.pending.map((t) => ({ txid: t.txid, amountBtc: btc(t.netSats) })),
  };
}

/** The txids a drafted batch covers, from its External Document Nos. */
export function draftedTxids(lines: BtcJournalLine[], txids: string[]): Set<string> {
  const out = new Set<string>();
  for (const line of lines) {
    const ref = line.externalDocumentNumber.toLowerCase();
    const hit = ref.length >= MIN_TXID_PREFIX ? txids.find((t) => t.startsWith(ref)) : undefined;
    if (hit) out.add(hit);
  }
  return out;
}
