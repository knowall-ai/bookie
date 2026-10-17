import { describe, expect, it } from 'vitest';
import { buildAccountTransactions, buildJournalReport, type LedgerJournal } from './ledger';
import { fromBcGlEntriesToLedger } from '@/lib/connectors/bc/modules/ledger';
import { demoLedgerJournals } from '@/lib/connectors/demo/modules/ledger';

const journals: LedgerJournal[] = [
  {
    id: 'j2',
    number: '12',
    date: '2026-09-20',
    source: 'Spend Money',
    reference: 'RENT',
    lines: [
      { accountCode: '469', accountName: 'Rent', description: 'Roastery rent', amount: 1500 },
      { accountCode: '090', accountName: 'Business Current Account', amount: -1500 },
    ],
  },
  {
    id: 'j1',
    number: '11',
    date: '2026-09-05',
    source: 'Receive Money',
    lines: [
      { accountCode: '090', accountName: 'Business Current Account', amount: 240.5 },
      { accountCode: '200', accountName: 'Sales', amount: -240.5 },
      { accountCode: '820', accountName: 'VAT', amount: 0 },
    ],
  },
  {
    id: 'j0',
    number: '10',
    date: '2026-08-31',
    source: 'Manual Journal',
    lines: [
      { accountCode: '090', amount: 999 },
      { accountCode: '970', amount: -999 },
    ],
  },
];

const base = { orgName: 'Contoso Coffee Roasters Ltd', from: '2026-09-01', to: '2026-09-30' };

describe('account transactions', () => {
  it('lays out one section per account, oldest first, with totals and net movement', () => {
    const report = buildAccountTransactions({ ...base, journals, notes: ['Accrual basis'] });
    expect(report.subtitles).toEqual([
      'Contoso Coffee Roasters Ltd',
      '1 Sept 2026 to 30 Sept 2026',
      'Accrual basis',
    ]);
    expect(report.columns).toEqual([
      'Date',
      'Source',
      'Description',
      'Reference',
      'Debit',
      'Credit',
    ]);
    expect(report.textColumns).toEqual([1, 2, 3]);
    expect(report.sections.map((s) => s.title)).toEqual([
      '090 - Business Current Account',
      '200 - Sales',
      '469 - Rent',
    ]);
    const bank = report.sections[0].rows;
    expect(bank.map((r) => r.cells)).toEqual([
      ['5 Sept 2026', 'Receive Money', '', '11', 240.5, null],
      ['20 Sept 2026', 'Spend Money', '', 'RENT', null, 1500],
      ['Total 090 - Business Current Account', null, null, null, 240.5, 1500],
      ['Net movement', null, null, null, -1259.5, null],
    ]);
  });

  it('limits to one account and leaves out zero lines and out-of-period journals', () => {
    const report = buildAccountTransactions({ ...base, journals, accountCode: '820' });
    expect(report.sections).toEqual([]);
    const rent = buildAccountTransactions({ ...base, journals, accountCode: '469' });
    expect(rent.sections).toHaveLength(1);
    expect(rent.sections[0].rows[0].cells[2]).toBe('Roastery rent');
  });
});

describe('journal report', () => {
  it('lists each journal in the period with balanced totals', () => {
    const report = buildJournalReport({ ...base, journals });
    expect(report.sections.map((s) => s.title)).toEqual([
      '5 Sept 2026 · Journal 11 · Receive Money',
      '20 Sept 2026 · Journal 12 · Spend Money · RENT',
    ]);
    expect(report.sections[0].rows).toEqual([
      { kind: 'row', cells: ['090 - Business Current Account', '', 240.5, null] },
      { kind: 'row', cells: ['200 - Sales', '', null, 240.5] },
      { kind: 'summary', cells: ['Total', null, 240.5, 240.5] },
    ]);
  });
});

describe('business central G/L entries as journals', () => {
  it('groups by document number and posting date, with account names', () => {
    const ledger = fromBcGlEntriesToLedger(
      [
        {
          id: 'e2',
          entryNumber: 2,
          postingDate: '2026-09-03',
          documentNumber: 'G00012',
          documentType: 'Payment',
          accountNumber: '2910',
          debitAmount: 0,
          creditAmount: 80,
        },
        {
          id: 'e1',
          entryNumber: 1,
          postingDate: '2026-09-03',
          documentNumber: 'G00012',
          documentType: 'Payment',
          accountNumber: '8640',
          description: 'Card fees',
          debitAmount: 80,
          creditAmount: 0,
        },
        {
          id: 'e3',
          entryNumber: 3,
          postingDate: '2026-09-04',
          documentNumber: 'G00013',
          documentType: '_x0020_',
          accountNumber: '8640',
          debitAmount: 5,
          creditAmount: 0,
        },
      ],
      new Map([
        ['2910', 'Bank Account'],
        ['8640', 'Bank Charges'],
      ])
    );
    expect(ledger).toEqual([
      {
        id: 'G00012~2026-09-03',
        number: 'G00012',
        date: '2026-09-03',
        source: 'Payment',
        lines: [
          {
            accountCode: '8640',
            accountName: 'Bank Charges',
            description: 'Card fees',
            amount: 80,
          },
          { accountCode: '2910', accountName: 'Bank Account', description: undefined, amount: -80 },
        ],
      },
      {
        id: 'G00013~2026-09-04',
        number: 'G00013',
        date: '2026-09-04',
        source: undefined,
        lines: [
          { accountCode: '8640', accountName: 'Bank Charges', description: undefined, amount: 5 },
        ],
      },
    ]);
  });
});

describe('demo ledger as journals', () => {
  it('groups demo ledger entries and labels sources as Xero does', () => {
    const ledger = demoLedgerJournals(
      [
        {
          id: 'gl-1',
          date: '2026-09-01',
          accountCode: '090',
          documentNumber: 'INV-0001',
          sourceType: 'ACCRECPAYMENT',
          debit: 120,
          credit: 0,
        },
        {
          id: 'gl-2',
          date: '2026-09-01',
          accountCode: '610',
          documentNumber: 'INV-0001',
          sourceType: 'ACCRECPAYMENT',
          debit: 0,
          credit: 120,
        },
      ],
      new Map([['610', 'Accounts Receivable']])
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      source: 'Receivable Payment',
      reference: 'INV-0001',
      lines: [
        { accountCode: '090', amount: 120 },
        { accountCode: '610', accountName: 'Accounts Receivable', amount: -120 },
      ],
    });
  });
});
