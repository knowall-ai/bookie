import { describe, expect, it } from 'vitest';
import type { BtcLedgerEntry } from '@/lib/connectors/types';
import {
  btcDocumentNumber,
  DraftError,
  draftedTxids,
  entryTxid,
  journalLinesFor,
  reconcile,
  txDate,
} from './reconcile';
import type { ChainTransaction } from './scan';

/* Made-up transactions and ledger entries; txids are arbitrary hex. */
const id = (c: string) => c.repeat(64);
const at = (iso: string) => Date.parse(iso) / 1000;

function tx(over: Partial<ChainTransaction> & { txid: string; netSats: number }): ChainTransaction {
  const pending = over.pending ?? false;
  return {
    height: pending ? undefined : 900_000,
    blockTime: pending ? undefined : at('2026-09-10T12:00:00Z'),
    confirmations: pending ? 0 : 10,
    pending,
    receivedSats: Math.max(0, over.netSats),
    sentSats: Math.max(0, -over.netSats),
    direction: over.netSats >= 0 ? 'in' : 'out',
    ...over,
  };
}

function entry(over: Partial<BtcLedgerEntry> & { id: string; amountSats: number }): BtcLedgerEntry {
  return { postingDate: '2026-09-10', ...over };
}

describe('entryTxid', () => {
  const txids = [id('a'), id('b')];

  it('matches BC’s 35-character, upper-cased External Document No.', () => {
    expect(
      entryTxid(
        entry({
          id: '1',
          amountSats: 1,
          externalDocumentNumber: id('a').slice(0, 35).toUpperCase(),
        }),
        txids
      )
    ).toBe(id('a'));
  });

  it('matches a full txid in the description', () => {
    expect(entryTxid(entry({ id: '1', amountSats: 1, description: `BTC ${id('b')}` }), txids)).toBe(
      id('b')
    );
  });

  it('ignores short or non-hex references', () => {
    expect(
      entryTxid(entry({ id: '1', amountSats: 1, externalDocumentNumber: 'AAAA' }), txids)
    ).toBeUndefined();
    expect(
      entryTxid(entry({ id: '1', amountSats: 1, externalDocumentNumber: 'INV-0042' }), txids)
    ).toBeUndefined();
  });
});

describe('reconcile', () => {
  it('matches by txid first, grouping every entry for it', () => {
    const t = tx({ txid: id('a'), netSats: -61_000, feeSats: 1_000 });
    const result = reconcile(
      [t],
      [
        entry({ id: 'pay', amountSats: -60_000, externalDocumentNumber: id('a').slice(0, 35) }),
        entry({ id: 'fee', amountSats: -1_000, externalDocumentNumber: id('a').slice(0, 35) }),
      ]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({
      by: 'txid',
      amountDiffers: false,
      ledgerSats: -61_000,
    });
    expect(result.ledgerOnly).toEqual([]);
  });

  it('flags a txid match whose amounts differ', () => {
    const result = reconcile(
      [tx({ txid: id('a'), netSats: 1_200_000 })],
      [entry({ id: 'e', amountSats: 1_150_000, externalDocumentNumber: id('a').slice(0, 35) })]
    );
    expect(result.matched[0]).toMatchObject({
      by: 'txid',
      amountDiffers: true,
      ledgerSats: 1_150_000,
    });
  });

  it('then matches the exact amount within three days, nearest first', () => {
    const t = tx({ txid: id('a'), netSats: 50_000 });
    const result = reconcile(
      [t],
      [
        entry({ id: 'far', amountSats: 50_000, postingDate: '2026-09-13' }),
        entry({ id: 'near', amountSats: 50_000, postingDate: '2026-09-11' }),
        entry({ id: 'too-far', amountSats: 50_000, postingDate: '2026-09-14' }),
      ]
    );
    expect(result.matched[0]).toMatchObject({ by: 'amount', entries: [{ id: 'near' }] });
    expect(result.ledgerOnly.map((e) => e.id)).toEqual(['too-far', 'far']);
  });

  it('never matches a different amount, or one entry twice', () => {
    const result = reconcile(
      [
        tx({ txid: id('a'), netSats: 50_000 }),
        tx({ txid: id('b'), netSats: 50_000, blockTime: at('2026-09-11T00:00:00Z') }),
      ],
      [entry({ id: 'one', amountSats: 50_000 }), entry({ id: 'off', amountSats: 50_001 })]
    );
    expect(result.matched).toHaveLength(1);
    expect(result.chainOnly).toHaveLength(1);
    expect(result.ledgerOnly.map((e) => e.id)).toEqual(['off']);
  });

  it('keeps pending transactions apart and never matches them by amount', () => {
    const result = reconcile(
      [tx({ txid: id('a'), netSats: 5_000, pending: true })],
      [entry({ id: 'same-amount', amountSats: 5_000 })]
    );
    expect(result.pending).toHaveLength(1);
    expect(result.matched).toEqual([]);
    expect(result.ledgerOnly).toHaveLength(1);
  });

  it('dates a transaction by the UTC day of its block', () => {
    expect(txDate(tx({ txid: id('a'), netSats: 1, blockTime: at('2026-09-10T23:59:59Z') }))).toBe(
      '2026-09-10'
    );
  });
});

describe('journalLinesFor', () => {
  const accounts = { bankAccountNumber: 'BTC-01', counterAccount: '2190', feeAccount: '8430' };
  const withDate = (t: ChainTransaction) => ({ ...t, date: txDate(t) });

  it('drafts a receipt as one bank line against the counter account', () => {
    const lines = journalLinesFor(withDate(tx({ txid: id('a'), netSats: 150_000 })), accounts);
    expect(lines).toEqual([
      {
        bankAccountNumber: 'BTC-01',
        postingDate: '2026-09-10',
        documentNumber: btcDocumentNumber(id('a')),
        externalDocumentNumber: id('a').slice(0, 35),
        description: `BTC ${id('a')}`,
        amountSats: 150_000,
        balancingAccountNumber: '2190',
      },
    ]);
    expect(btcDocumentNumber(id('a'))).toBe('BTC-AAAAAAAAAAAA');
  });

  it('drafts a payment and its fee as separate lines', () => {
    const lines = journalLinesFor(
      withDate(tx({ txid: id('b'), netSats: -61_000, feeSats: 1_000 })),
      accounts
    );
    expect(lines.map((l) => [l.amountSats, l.balancingAccountNumber])).toEqual([
      [-60_000, '2190'],
      [-1_000, '8430'],
    ]);
    expect(lines.reduce((s, l) => s + l.amountSats, 0)).toBe(-61_000);
  });

  it('drafts only the fee for a move within the wallet', () => {
    const lines = journalLinesFor(
      withDate(tx({ txid: id('c'), netSats: -800, feeSats: 800, direction: 'self' })),
      accounts
    );
    expect(lines.map((l) => [l.amountSats, l.balancingAccountNumber])).toEqual([[-800, '8430']]);
  });

  it('keeps a send with an unknown fee as one line, and says so', () => {
    const [line] = journalLinesFor(withDate(tx({ txid: id('d'), netSats: -61_000 })), accounts);
    expect(line.amountSats).toBe(-61_000);
    expect(line.description).toMatch(/fee not separated/);
  });

  it('needs a fee account for a payment with a fee, and refuses pending transactions', () => {
    expect(() =>
      journalLinesFor(withDate(tx({ txid: id('e'), netSats: -61_000, feeSats: 1_000 })), {
        bankAccountNumber: 'BTC-01',
        counterAccount: '2190',
      })
    ).toThrow(DraftError);
    expect(() =>
      journalLinesFor(withDate(tx({ txid: id('f'), netSats: 1, pending: true })), accounts)
    ).toThrow(/Pending/);
  });

  it('recognises which transactions a draft already covers', () => {
    const lines = journalLinesFor(withDate(tx({ txid: id('a'), netSats: 1 })), accounts);
    expect([...draftedTxids(lines, [id('a'), id('b')])]).toEqual([id('a')]);
  });
});
