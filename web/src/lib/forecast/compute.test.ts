import { describe, expect, it } from 'vitest';
import type { BankAccount, BankTransaction, Invoice } from '@/lib/domain/types';
import {
  computeForecast,
  forecastBuckets,
  forecastCurrencies,
  openingBalance,
  plannedOccurrences,
  projectionFrom,
  type ForecastInput,
} from './compute';
import type { PlannedItem } from './types';

// Wednesday. Its week starts Monday 12 Oct.
const TODAY = '2026-10-14';

let n = 0;
function doc(partial: Partial<Invoice> & Pick<Invoice, 'type'>): Invoice {
  n++;
  return {
    id: `doc-${n}`,
    number: `${partial.type === 'sales' ? 'INV' : 'BILL'}-${n}`,
    contact: { id: 'c1', name: 'Fabrikam Hotels' },
    date: '2026-10-01',
    dueDate: '2026-10-20',
    status: 'authorised',
    currency: 'GBP',
    subTotal: 100,
    totalTax: 20,
    total: 120,
    amountDue: 120,
    isOverdue: false,
    ...partial,
  };
}

const accounts: BankAccount[] = [
  { id: 'a1', name: 'Current', currency: 'GBP', balance: 10_000 },
  { id: 'a2', name: 'Savings', currency: 'GBP', balance: 2_500.5 },
  { id: 'a3', name: 'Dollar account', currency: 'USD', balance: 3_000 },
];

const input = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  today: TODAY,
  horizon: '13w',
  currency: 'GBP',
  bankAccounts: accounts,
  invoices: [],
  planned: [],
  sourceName: 'Xero',
  ...over,
});

describe('forecastBuckets', () => {
  it('makes 13 Monday weeks, the first starting today', () => {
    const b = forecastBuckets(TODAY, '13w');
    expect(b).toHaveLength(13);
    expect(b[0]).toMatchObject({ start: TODAY, end: '2026-10-18', label: 'Week of 12 Oct' });
    expect(b[1]).toMatchObject({ start: '2026-10-19', end: '2026-10-25' });
    expect(b[12].end).toBe('2027-01-10');
  });

  it('makes calendar months for 6 and 12 months', () => {
    const six = forecastBuckets(TODAY, '6m');
    expect(six).toHaveLength(6);
    expect(six[0]).toMatchObject({ start: TODAY, end: '2026-10-31', label: 'Oct 2026' });
    expect(six[5]).toMatchObject({ start: '2027-03-01', end: '2027-03-31' });
    expect(forecastBuckets(TODAY, '12m')[11].end).toBe('2027-09-30');
  });
});

describe('computeForecast: bucketing', () => {
  it('places approved invoices and bills in the bucket of their due date', () => {
    const f = computeForecast(
      input({
        invoices: [
          doc({ type: 'sales', dueDate: '2026-10-14', amountDue: 500 }),
          doc({ type: 'sales', dueDate: '2026-10-18', amountDue: 250 }),
          doc({ type: 'purchase', dueDate: '2026-10-19', amountDue: 300 }),
          doc({ type: 'sales', dueDate: '2026-10-25', amountDue: 40, total: 100 }),
        ],
      })
    );
    expect(f.buckets[0].totals.knownIn).toBe(750);
    expect(f.buckets[1].totals.knownOut).toBe(300);
    expect(f.buckets[1].totals.knownIn).toBe(40); // what's left to pay, not the total
    expect(f.totals).toMatchObject({ knownIn: 790, knownOut: 300 });
    expect(f.opening.balance).toBe(12_500.5);
    expect(f.buckets[0].closing).toBe(13_250.5);
    expect(f.buckets[1].closing).toBe(12_990.5);
    expect(f.closing).toBe(12_990.5);
  });

  it('ignores paid, voided and fully paid documents', () => {
    const f = computeForecast(
      input({
        invoices: [
          doc({ type: 'sales', status: 'paid', amountDue: 0 }),
          doc({ type: 'sales', status: 'voided' }),
          doc({ type: 'sales', amountDue: 0 }),
        ],
      })
    );
    expect(f.totals.knownIn).toBe(0);
    expect(f.buckets.flatMap((b) => b.entries)).toHaveLength(0);
  });

  it('counts documents due after the horizon without placing them', () => {
    const f = computeForecast(
      input({ invoices: [doc({ type: 'purchase', dueDate: '2027-02-01', amountDue: 99 })] })
    );
    expect(f.afterHorizon).toEqual({ in: 0, out: 99, count: 1 });
    expect(f.totals.knownOut).toBe(0);
  });
});

describe('computeForecast: overdue', () => {
  it('keeps overdue documents out of every bucket, in their own band', () => {
    const f = computeForecast(
      input({
        invoices: [
          doc({ type: 'sales', dueDate: '2026-09-30', amountDue: 1_000 }),
          doc({ type: 'sales', dueDate: '2026-10-13', amountDue: 200 }),
          doc({ type: 'purchase', dueDate: '2026-08-01', amountDue: 75.25 }),
          doc({ type: 'sales', dueDate: TODAY, amountDue: 10 }),
        ],
      })
    );
    expect(f.overdue.in).toMatchObject({ count: 2, total: 1_200 });
    expect(f.overdue.out).toMatchObject({ count: 1, total: 75.25 });
    // Due today is not overdue.
    expect(f.totals.knownIn).toBe(10);
    expect(f.buckets.flatMap((b) => b.entries)).toHaveLength(1);
    expect(f.closing).toBe(12_510.5);
  });

  it('lists unknown amounts and documents without a due date, never adding them', () => {
    const f = computeForecast(
      input({
        invoices: [
          doc({ type: 'purchase', amountDue: undefined }),
          doc({ type: 'sales', dueDate: undefined, amountDue: 400 }),
        ],
      })
    );
    expect(f.unknownAmount).toHaveLength(1);
    expect(f.unknownAmount[0].amount).toBeUndefined();
    expect(f.noDueDate).toHaveLength(1);
    expect(f.totals.knownOut).toBe(0);
    expect(f.totals.knownIn).toBe(0);
    expect(f.closing).toBe(12_500.5);
  });
});

describe('computeForecast: drafts layer', () => {
  const invoices = [
    doc({ type: 'sales', status: 'draft', dueDate: '2026-10-20', amountDue: 300 }),
    doc({ type: 'purchase', status: 'submitted', dueDate: '2026-10-21', amountDue: 100 }),
  ];
  it('is off by default', () => {
    const f = computeForecast(input({ invoices }));
    expect(f.layers.drafts).toBe(false);
    expect(f.totals.draftIn).toBe(0);
    expect(f.closing).toBe(12_500.5);
  });
  it('adds drafts and awaiting approval as their own layer when on', () => {
    const f = computeForecast(input({ invoices, includeDrafts: true }));
    expect(f.totals).toMatchObject({ draftIn: 300, draftOut: 100, knownIn: 0 });
    expect(f.closing).toBe(12_700.5);
    expect(f.layersUsed).toContain('Drafts and awaiting approval');
  });
});

describe('computeForecast: currencies', () => {
  it('never adds currencies together', () => {
    const invoices = [
      doc({ type: 'sales', currency: 'USD', amountDue: 1_000 }),
      doc({ type: 'sales', currency: 'GBP', amountDue: 100 }),
    ];
    const gbp = computeForecast(input({ invoices }));
    const usd = computeForecast(input({ invoices, currency: 'USD' }));
    expect(gbp.totals.knownIn).toBe(100);
    expect(gbp.opening.balance).toBe(12_500.5);
    expect(usd.totals.knownIn).toBe(1_000);
    expect(usd.opening.balance).toBe(3_000);
    expect(usd.closing).toBe(4_000);
  });

  it('lists the currencies, base first', () => {
    expect(
      forecastCurrencies(
        accounts,
        [
          doc({ type: 'sales', currency: 'EUR' }),
          doc({ type: 'sales', currency: 'JPY', status: 'paid' }),
        ],
        [],
        'GBP'
      )
    ).toEqual(['GBP', 'EUR', 'USD']);
  });
});

describe('openingBalance', () => {
  it('excludes accounts without a balance, or with a converted one, and says why', () => {
    const result = openingBalance(
      [
        { id: 'a', name: 'Current', currency: 'GBP', balance: 100 },
        { id: 'b', name: 'No balance', currency: 'GBP' },
        { id: 'c', name: 'Euro', currency: 'EUR', balance: 50, balanceCurrency: 'GBP' },
      ],
      'GBP',
      'Business Central'
    );
    expect(result.balance).toBe(100);
    expect(result.excluded.map((e) => e.id)).toEqual(['b', 'c']);
    expect(result.excluded[0].reason).toMatch(/doesn't report this account's balance/);
    expect(result.excluded[1].reason).toMatch(/converted to GBP/);
  });

  it('is unknown when no account in the currency has a balance', () => {
    const result = openingBalance([{ id: 'b', name: 'X', currency: 'GBP' }], 'GBP', 'BC');
    expect(result.balance).toBeUndefined();
    const f = computeForecast(input({ bankAccounts: [{ id: 'b', name: 'X', currency: 'GBP' }] }));
    expect(f.closing).toBeUndefined();
    expect(f.lowest).toBeUndefined();
  });
});

describe('plannedOccurrences', () => {
  const base: PlannedItem = {
    id: 'p',
    description: 'Rent',
    amount: 1_000,
    direction: 'out',
    currency: 'GBP',
    date: '2026-01-31',
  };

  it('expands monthly repeats on the same day, clamped to month end', () => {
    expect(plannedOccurrences({ ...base, repeat: 'monthly' }, '2026-10-14', '2027-03-31')).toEqual([
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('stops at the end date and skips dates before today', () => {
    expect(
      plannedOccurrences(
        { ...base, date: '2026-10-01', repeat: 'weekly', endDate: '2026-11-01' },
        '2026-10-14',
        '2027-01-10'
      )
    ).toEqual(['2026-10-15', '2026-10-22', '2026-10-29']);
  });

  it('expands quarterly repeats', () => {
    expect(
      plannedOccurrences({ ...base, date: '2026-11-07', repeat: 'quarterly' }, TODAY, '2027-09-30')
    ).toEqual(['2026-11-07', '2027-02-07', '2027-05-07', '2027-08-07']);
  });

  it('keeps a one-off only when it falls in the horizon', () => {
    expect(plannedOccurrences({ ...base, date: '2026-12-01' }, TODAY, '2027-01-10')).toEqual([
      '2026-12-01',
    ]);
    expect(plannedOccurrences({ ...base, date: '2026-10-01' }, TODAY, '2027-01-10')).toEqual([]);
  });

  it('feeds the planned layer, never Known, and only in its own currency', () => {
    const f = computeForecast(
      input({
        planned: [
          { ...base, date: '2026-10-16', repeat: 'weekly', amount: 100 },
          { ...base, id: 'q', date: '2026-10-20', direction: 'in', amount: 50, currency: 'USD' },
        ],
      })
    );
    expect(f.totals.plannedOut).toBe(1_300);
    expect(f.totals.knownOut).toBe(0);
    expect(f.totals.plannedIn).toBe(0);
    expect(f.buckets[0].entries[0]).toMatchObject({ layer: 'planned', plannedId: 'p' });
  });
});

describe('lowest point', () => {
  it('finds the lowest closing balance from the layers that are on', () => {
    const f = computeForecast(
      input({
        bankAccounts: [{ id: 'a', name: 'Current', currency: 'GBP', balance: 1_000 }],
        invoices: [
          doc({ type: 'purchase', dueDate: '2026-11-04', amountDue: 1_500 }),
          doc({ type: 'sales', dueDate: '2026-11-20', amountDue: 2_000 }),
          doc({ type: 'purchase', status: 'draft', dueDate: '2026-12-01', amountDue: 5_000 }),
        ],
      })
    );
    expect(f.lowest).toEqual({
      balance: -500,
      bucketKey: 'w3',
      label: 'Week of 2 Nov',
      belowZero: true,
    });
    const withDrafts = computeForecast(
      input({
        bankAccounts: [{ id: 'a', name: 'Current', currency: 'GBP', balance: 1_000 }],
        includeDrafts: true,
        invoices: [
          doc({ type: 'purchase', status: 'draft', dueDate: '2026-12-01', amountDue: 5_000 }),
        ],
      })
    );
    expect(withDrafts.lowest).toMatchObject({ balance: -4_000, label: 'Week of 30 Nov' });
  });
});

describe('projection', () => {
  const tx = (partial: Partial<BankTransaction>): BankTransaction => ({
    id: Math.random().toString(36),
    bankAccountId: 'a1',
    date: '2026-08-10',
    type: 'spend',
    amount: 300,
    currency: 'GBP',
    isReconciled: true,
    status: 'authorised',
    source: 'bank-transaction',
    ...partial,
  });
  const transactions = [
    tx({ date: '2026-07-01', amount: 900 }),
    tx({ date: '2026-09-30', amount: 600 }),
    tx({ date: '2026-08-15', type: 'receive', amount: 300 }),
    // Not counted: payments, transfers, this month, other currencies, deleted.
    tx({ source: 'payment', amount: 10_000 }),
    tx({ type: 'transfer-out', amount: 10_000 }),
    tx({ date: '2026-10-02', amount: 10_000 }),
    tx({ currency: 'USD', amount: 10_000 }),
    tx({ status: 'deleted', amount: 10_000 }),
    tx({ date: '2026-06-30', amount: 10_000 }),
  ];

  it('averages complete months of non-invoice bank transactions', () => {
    expect(projectionFrom(transactions, 3, TODAY, 'GBP')).toEqual({
      months: 3,
      from: '2026-07-01',
      to: '2026-09-30',
      label: 'Projection: average of Jul to Sep 2026',
      monthlyIn: 100,
      monthlyOut: 500,
      transactionCount: 3,
    });
  });

  it('is excluded by default', () => {
    const f = computeForecast(input());
    expect(f.layers.projected).toBe(false);
    expect(f.projection).toBeUndefined();
    expect(f.totals.projectedOut).toBe(0);
    expect(f.buckets.every((b) => b.entries.length === 0)).toBe(true);
  });

  it('spreads the average over each bucket when switched on', () => {
    const f = computeForecast(input({ projection: { months: 3, transactions } }));
    expect(f.layers.projected).toBe(true);
    // Window is 92 days; a full week gets 7/92 of three months' spend (1,500).
    expect(f.buckets[1].totals.projectedOut).toBe(114.13);
    // The first week counts from today (5 days).
    expect(f.buckets[0].totals.projectedOut).toBe(81.52);
    expect(f.layersUsed).toContain('Projection: average of Jul to Sep 2026');
  });

  it('is left out when the source cannot support it', () => {
    const f = computeForecast(
      input({ projection: { months: 3, transactions }, projectionUnavailable: 'No ledger.' })
    );
    expect(f.projection).toBeUndefined();
    expect(f.projectionUnavailable).toBe('No ledger.');
  });
});
