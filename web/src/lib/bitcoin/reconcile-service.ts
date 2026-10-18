import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import type { AccountingConnector, BtcJournalDraft, BtcLedgerEntry } from '@/lib/connectors/types';
import type { OrgRef } from '@/lib/domain/types';
import { WalletError } from './errors';
import { formatBtc, satsToBtc } from './format';
import {
  DraftError,
  draftedTxids,
  journalLinesFor,
  reconcile,
  type ReconcileResult,
} from './reconcile';
import type { WalletScan } from './scan';
import { loadWallet, walletsForOrg, type WalletSummary } from './wallets';
import { isConnectorError } from '@/lib/connectors/types';

/**
 * Phase 2: reconcile a wallet against the Business Central bank account it is (or,
 * for the demo, the fictional BTC bank account it is linked to).
 */

export interface ReconcileScope {
  org: Pick<OrgRef, 'key' | 'kind'>;
  connector: Pick<AccountingConnector, 'bitcoin' | 'accounts'>;
}

export type ReconcileView =
  | {
      status: 'ok';
      scan: WalletScan;
      result: ReconcileResult;
      drafts: BtcJournalDraft[];
      /** Txids already on one of Bookie's unposted batches. */
      drafted: string[];
      /** Sum of the posted bank ledger entries (the account's balance in BTC). */
      ledgerSats: number;
      bankAccountNumber: string;
    }
  | { status: 'unavailable'; reason: string };

export async function loadReconcile(
  auth: AuthContext,
  scope: ReconcileScope,
  walletId: string
): Promise<{ wallet: WalletSummary; view: ReconcileView }> {
  const { wallet, load } = await loadWallet(auth, scope, walletId);
  const unavailable = (reason: string) => ({
    wallet,
    view: { status: 'unavailable' as const, reason },
  });
  const btc = scope.connector.bitcoin;
  if (scope.org.kind !== 'business-central' && scope.org.kind !== 'demo') {
    return unavailable(
      'Reconciling against the books needs a Business Central bank account in BTC.'
    );
  }
  if (!wallet.bcBankAccountNumber) {
    return unavailable('This wallet isn’t linked to a Business Central bank account.');
  }
  if (!btc?.ledger) return unavailable('This organisation can’t reconcile Bitcoin wallets.');
  if (wallet.currencyCode !== 'BTC') {
    return unavailable(
      `Bank account ${wallet.bcBankAccountNumber} is in ${wallet.currencyCode || 'the company’s local currency'}, not BTC, so its amounts can’t be matched to the chain. Set its currency to BTC in Business Central (see docs/BITCOIN.adoc).`
    );
  }
  if (load.status !== 'ok') return unavailable(load.message);
  const [ledger, drafts] = await Promise.all([
    btc.ledger(wallet.bcBankAccountNumber),
    btc.drafts?.(wallet.bcBankAccountNumber) ?? Promise.resolve([]),
  ]);
  if (ledger.status !== 'ok') return unavailable(ledger.reason);
  const result = reconcile(load.scan.transactions, ledger.entries);
  const txids = load.scan.transactions.map((t) => t.txid);
  const drafted = new Set(drafts.flatMap((d) => [...draftedTxids(d.lines, txids)]));
  return {
    wallet,
    view: {
      status: 'ok',
      scan: load.scan,
      result,
      drafts,
      drafted: [...drafted],
      ledgerSats: ledger.entries.reduce((s, e) => s + e.amountSats, 0),
      bankAccountNumber: wallet.bcBankAccountNumber,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Drafting and posting                                                */
/* ------------------------------------------------------------------ */

export interface DraftRequest {
  txids: string[];
  counterAccount: string;
  feeAccount?: string;
}

export async function draftReconcileJournal(
  auth: AuthContext,
  scope: ReconcileScope,
  walletId: string,
  request: DraftRequest
): Promise<BtcJournalDraft> {
  const { view } = await loadReconcile(auth, scope, walletId);
  if (view.status !== 'ok') throw new WalletError(view.reason);
  const draft = scope.connector.bitcoin?.draftJournal;
  if (!draft) throw new WalletError('This organisation can’t draft journal lines.');

  const codes = new Set(
    (await scope.connector.accounts?.list())?.filter((a) => !a.isBank).map((a) => a.code) ?? []
  );
  for (const code of [request.counterAccount, request.feeAccount]) {
    if (code && !codes.has(code)) {
      throw new WalletError(`Account ${code} isn’t in the chart of accounts.`);
    }
  }

  const waiting = new Map(view.result.chainOnly.map((t) => [t.txid, t]));
  const drafted = new Set(view.drafted);
  const lines = request.txids.flatMap((txid) => {
    const tx = waiting.get(txid);
    if (!tx || drafted.has(txid)) {
      throw new WalletError(
        'One of the chosen transactions is no longer waiting to be recorded. Reload and choose again.',
        409
      );
    }
    try {
      return journalLinesFor(tx, {
        bankAccountNumber: view.bankAccountNumber,
        counterAccount: request.counterAccount,
        feeAccount: request.feeAccount,
      });
    } catch (error) {
      if (error instanceof DraftError) throw new WalletError(error.message);
      throw error;
    }
  });
  return draft(lines);
}

export async function postReconcileJournal(
  auth: AuthContext,
  scope: ReconcileScope,
  walletId: string,
  batchId: string
): Promise<void> {
  const { wallet } = await loadWallet(auth, scope, walletId);
  const post = scope.connector.bitcoin?.postJournal;
  if (!wallet.bcBankAccountNumber || !post) {
    throw new WalletError('This organisation can’t post journal lines.');
  }
  await post(wallet.bcBankAccountNumber, batchId);
}

/* ------------------------------------------------------------------ */
/* The summary for Bookie (portal chat and voice, and the JSON API)    */
/* ------------------------------------------------------------------ */

const btc = (sats: number) => Number(satsToBtc(sats).replace(/,/g, ''));
const entryView = (e: BtcLedgerEntry) => ({
  postingDate: e.postingDate,
  documentNumber: e.documentNumber,
  externalDocumentNumber: e.externalDocumentNumber,
  description: e.description,
  amountBtc: btc(e.amountSats),
});

/**
 * The reconcile in plain figures: counts, then only what needs attention. Amounts are
 * BTC to 8 decimals, exactly as on chain and in the books; nothing is converted.
 */
export function reconcileSummary(wallet: WalletSummary, view: ReconcileView) {
  if (view.status !== 'ok')
    return { wallet: wallet.name, status: 'unavailable', reason: view.reason };
  const { result, scan } = view;
  const drafted = new Set(view.drafted);
  const differs = result.matched.filter((m) => m.amountDiffers);
  return {
    wallet: wallet.name,
    bankAccount: view.bankAccountNumber,
    status: 'ok',
    readAtBlock: scan.tip.height,
    counts: {
      matched: result.matched.length,
      matchedButAmountsDiffer: differs.length,
      onChainNotInBooks: result.chainOnly.length,
      inBooksNotOnChain: result.ledgerOnly.length,
      pending: result.pending.length,
      draftedNotPosted: view.drafted.length,
    },
    balances: {
      onChainConfirmedBtc: btc(scan.balance.confirmedSats),
      inBooksBtc: btc(view.ledgerSats),
      differenceBtc: btc(scan.balance.confirmedSats - view.ledgerSats),
      note: 'In the books = the sum of posted entries on the bank account. Pending transactions are in neither.',
    },
    onChainNotInBooks: result.chainOnly.map((t) => ({
      txid: t.txid,
      date: t.date,
      amountBtc: btc(t.netSats),
      feeBtc: t.feeSats === undefined ? undefined : btc(t.feeSats),
      drafted: drafted.has(t.txid),
    })),
    inBooksNotOnChain: result.ledgerOnly.map(entryView),
    amountsDiffer: differs.map((m) => ({
      txid: m.tx.txid,
      onChainBtc: btc(m.tx.netSats),
      inBooksBtc: btc(m.ledgerSats),
    })),
    pending: result.pending.map((t) => ({ txid: t.txid, amountBtc: btc(t.netSats) })),
  };
}

/**
 * Every wallet in the organisation, reconciled: what Bookie's `reconcile_bitcoin_wallets`
 * tool and `GET /api/orgs/{org}/bitcoin/reconcile` return. Read-only.
 */
export async function reconcileAllWallets(auth: AuthContext, scope: ReconcileScope, only?: string) {
  const { wallets, unavailable } = await walletsForOrg(auth, scope);
  if (unavailable) return { status: 'unavailable', reason: unavailable, wallets: [] };
  const chosen = only ? wallets.filter((w) => w.id === only || w.name === only) : wallets;
  const results = await Promise.all(
    chosen.map(async (w) => {
      try {
        const { wallet, view } = await loadReconcile(auth, scope, w.id);
        return reconcileSummary(wallet, view);
      } catch (error) {
        const reason =
          error instanceof WalletError || isConnectorError(error)
            ? error.message
            : 'The reconcile failed.';
        if (!(error instanceof WalletError) && !isConnectorError(error)) {
          console.error('[bookie] bitcoin reconcile failed', error);
        }
        return { wallet: w.name, status: 'unavailable', reason };
      }
    })
  );
  return { status: 'ok', wallets: results };
}

/** "3 matched, 2 on chain not in the books…" for status lines and logs. */
export function reconcileHeadline(view: ReconcileView): string {
  if (view.status !== 'ok') return view.reason;
  const r = view.result;
  return `${r.matched.length} matched, ${r.chainOnly.length} on chain not in the books, ${r.ledgerOnly.length} in the books not on chain, ${r.pending.length} pending. Difference ${formatBtc(view.scan.balance.confirmedSats - view.ledgerSats, { sign: true })}.`;
}
