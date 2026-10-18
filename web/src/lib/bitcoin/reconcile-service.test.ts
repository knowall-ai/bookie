import { describe, expect, it } from 'vitest';
import type { AuthContext } from '@/lib/auth/context';
import { DEMO_MEMBER } from '@/lib/auth/dev';
import { createDemoConnector, DEMO_ORGS } from '@/lib/connectors/demo';
import { demoData } from '@/lib/connectors/demo/data';
import { demoSlot } from '@/lib/connectors/demo/modules/state';
import type { BtcLedgerEntry } from '@/lib/connectors/types';
import { demoTxid, DEMO_WALLET_ID } from './demo';
import {
  draftReconcileJournal,
  loadReconcile,
  postReconcileJournal,
  reconcileAllWallets,
  reconcileHeadline,
} from './reconcile-service';
import { WalletError } from './errors';

/* The demo organisation end to end: fictional wallet, fictional BTC bank ledger. */

const auth: AuthContext = {
  mode: 'demo',
  user: DEMO_MEMBER,
  getToken: async () => {
    throw new Error('no tokens');
  },
};

function scope() {
  const org = DEMO_ORGS.find((o) => o.key === 'demo.contoso')!;
  return { org, connector: createDemoConnector(org) };
}

describe('reconcile on the demo organisation', () => {
  it('sorts the wallet into matched, on chain only, in the books only and pending', async () => {
    const { view } = await loadReconcile(auth, scope(), DEMO_WALLET_ID);
    if (view.status !== 'ok') throw new Error(view.reason);
    const { result } = view;
    expect(result.matched.map((m) => [m.by, m.amountDiffers])).toEqual(
      expect.arrayContaining([
        ['txid', false],
        ['amount', false],
        ['txid', true],
      ])
    );
    expect(result.chainOnly.map((t) => t.txid)).toEqual([
      demoTxid('receive-oct'),
      demoTxid('send-oct'),
    ]);
    expect(result.ledgerOnly.map((e) => e.documentNumber)).toEqual(['ADJ-0007']);
    expect(result.pending.map((t) => t.txid)).toEqual([demoTxid('pending-receive')]);
    expect(view.ledgerSats).toBe(21_347_900);
    expect(reconcileHeadline(view)).toMatch(
      /^3 matched, 2 on chain not in the books, 1 in the books/
    );
  });

  it('summarises for Bookie in exact BTC, without converting', async () => {
    const summary = await reconcileAllWallets(auth, scope());
    expect(summary.status).toBe('ok');
    const [wallet] = summary.wallets as Record<string, unknown>[];
    expect(wallet).toMatchObject({
      wallet: 'Contoso Treasury',
      bankAccount: 'BTC-TREASURY',
      counts: {
        matched: 3,
        matchedButAmountsDiffer: 1,
        onChainNotInBooks: 2,
        inBooksNotOnChain: 1,
        pending: 1,
      },
      balances: { onChainConfirmedBtc: 0.186464, inBooksBtc: 0.213479, differenceBtc: -0.027015 },
    });
    expect(JSON.stringify(wallet)).not.toMatch(/GBP|£/);
  });

  it('drafts the chosen transactions, then posts them only on request', async () => {
    const s = scope();
    const draft = await draftReconcileJournal(auth, s, DEMO_WALLET_ID, {
      txids: [demoTxid('send-oct')],
      counterAccount: '620',
      feeAccount: '404',
    });
    expect(draft.lines.map((l) => [l.amountSats, l.balancingAccountNumber])).toEqual([
      [-3_000_000, '620'],
      [-1_500, '404'],
    ]);

    let { view } = await loadReconcile(auth, s, DEMO_WALLET_ID);
    if (view.status !== 'ok') throw new Error(view.reason);
    expect(view.drafted).toEqual([demoTxid('send-oct')]);
    // Drafted is not posted: still on chain only.
    expect(view.result.chainOnly.map((t) => t.txid)).toContain(demoTxid('send-oct'));

    await expect(
      draftReconcileJournal(auth, s, DEMO_WALLET_ID, {
        txids: [demoTxid('send-oct')],
        counterAccount: '620',
        feeAccount: '404',
      })
    ).rejects.toThrow(/no longer waiting/);

    await postReconcileJournal(auth, s, DEMO_WALLET_ID, draft.batchId);
    ({ view } = await loadReconcile(auth, s, DEMO_WALLET_ID));
    if (view.status !== 'ok') throw new Error(view.reason);
    const posted = view.result.matched.find((m) => m.tx.txid === demoTxid('send-oct'));
    expect(posted).toMatchObject({ by: 'txid', amountDiffers: false });
    expect(view.drafted).toEqual([]);
  });

  it('refuses accounts that are not in the chart, and matched transactions', async () => {
    await expect(
      draftReconcileJournal(auth, scope(), DEMO_WALLET_ID, {
        txids: [demoTxid('receive-oct')],
        counterAccount: '99999',
      })
    ).rejects.toThrow(/isn’t in the chart of accounts/);
    await expect(
      draftReconcileJournal(auth, scope(), DEMO_WALLET_ID, {
        txids: [demoTxid('receive-aug')],
        counterAccount: '620',
      })
    ).rejects.toBeInstanceOf(WalletError);
  });

  it('won’t post a draft whose transaction has been recorded since, and says so', async () => {
    const s = scope();
    const draft = await draftReconcileJournal(auth, s, DEMO_WALLET_ID, {
      txids: [demoTxid('receive-oct')],
      counterAccount: '620',
    });
    // Meanwhile someone records the same receipt by hand, with its txid.
    const ledger = demoSlot<{ ledger: BtcLedgerEntry[] }>(demoData('contoso'), 'bitcoin', () => {
      throw new Error('demo state should exist');
    }).ledger;
    ledger.push({
      id: 'by-hand',
      postingDate: '2026-10-14',
      externalDocumentNumber: demoTxid('receive-oct').slice(0, 35).toUpperCase(),
      amountSats: 450_000,
    });
    const { view } = await loadReconcile(auth, s, DEMO_WALLET_ID);
    if (view.status !== 'ok') throw new Error(view.reason);
    expect(view.alreadyInBooks).toEqual([draft.batchId]);
    const error = await postReconcileJournal(auth, s, DEMO_WALLET_ID, draft.batchId).catch(
      (e: WalletError) => e
    );
    expect(error).toBeInstanceOf(WalletError);
    expect((error as WalletError).status).toBe(409);
    expect((error as WalletError).message).toMatch(/^Already in the books/);
    // Nothing was posted twice.
    expect(ledger.filter((e) => e.amountSats === 450_000)).toHaveLength(1);
    ledger.splice(ledger.indexOf(ledger.find((e) => e.id === 'by-hand')!), 1);
  });

  it('won’t post a batch it didn’t draft', async () => {
    await expect(
      postReconcileJournal(auth, scope(), DEMO_WALLET_ID, 'demo-btc-batch-999')
    ).rejects.toThrow(/isn’t one of Bookie’s drafts/);
  });
});
