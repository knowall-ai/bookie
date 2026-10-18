import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import type { AccountingConnector, BtcJournalDraft } from '@/lib/connectors/types';
import type { OrgRef } from '@/lib/domain/types';
import { WalletError } from './errors';
import { formatBtc } from './format';
import {
  DraftError,
  draftedTxids,
  journalLinesFor,
  reconcile,
  summariseReconcile,
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
      /** Drafted batches with a transaction the books already have: never to be posted. */
      alreadyInBooks: string[];
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
  // A draft whose transaction has since been recorded (by hand, or another draft posted)
  // would count it twice.
  const inBooks = new Set(result.matched.map((m) => m.tx.txid));
  const alreadyInBooks = drafts
    .filter((d) => [...draftedTxids(d.lines, txids)].some((t) => inBooks.has(t)))
    .map((d) => d.batchId);
  return {
    wallet,
    view: {
      status: 'ok',
      scan: load.scan,
      result,
      drafts,
      drafted: [...drafted],
      alreadyInBooks,
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
  const post = scope.connector.bitcoin?.postJournal;
  if (!post) throw new WalletError('This organisation can’t post journal lines.');
  // Read the chain and the books again now, not from when the draft was made: a
  // transaction recorded since (by hand, or by another draft) must not post twice.
  const { view } = await loadReconcile(auth, scope, walletId);
  if (view.status !== 'ok') throw new WalletError(view.reason);
  if (!view.drafts.some((d) => d.batchId === batchId)) {
    throw new WalletError(
      'That journal batch isn’t one of Bookie’s drafts for this wallet any more. Reload the page.',
      404
    );
  }
  if (view.alreadyInBooks.includes(batchId)) {
    throw new WalletError(
      'Already in the books: a transaction in this batch has been recorded since it was drafted, so Bookie won’t post it. Delete the draft batch in Business Central.',
      409
    );
  }
  await post(view.bankAccountNumber, batchId);
}

/* ------------------------------------------------------------------ */
/* The summary for Bookie (portal chat and voice, and the JSON API)    */
/* ------------------------------------------------------------------ */

/**
 * The reconcile in plain figures (see `summariseReconcile`, shared with the agent's
 * btc-wallet script). Amounts are BTC to 8 decimals; nothing is converted.
 */
export function reconcileSummary(wallet: WalletSummary, view: ReconcileView) {
  if (view.status !== 'ok')
    return { wallet: wallet.name, status: 'unavailable', reason: view.reason };
  return summariseReconcile({
    wallet: wallet.name,
    bankAccountNumber: view.bankAccountNumber,
    scan: view.scan,
    result: view.result,
    ledgerSats: view.ledgerSats,
    drafted: view.drafted,
  });
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
