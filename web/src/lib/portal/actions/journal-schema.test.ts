import { describe, expect, it } from 'vitest';
import { manualJournalSchema } from './journal-schema';
import { journalTotals, toJournalLines } from '@/components/accounting/JournalEditor';

describe('manual journal validation', () => {
  const base = { date: '2026-10-01', narration: 'Accrual' };

  it('accepts a balanced journal, despite floating point', () => {
    const parsed = manualJournalSchema.safeParse({
      ...base,
      lines: [
        { accountCode: '400', amount: 0.1 },
        { accountCode: '401', amount: 0.2 },
        { accountCode: '825', amount: -0.3 },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unbalanced, single-line and account-less journals', () => {
    expect(
      manualJournalSchema.safeParse({
        ...base,
        lines: [
          { accountCode: '400', amount: 10 },
          { accountCode: '825', amount: -9.99 },
        ],
      }).success
    ).toBe(false);
    expect(
      manualJournalSchema.safeParse({ ...base, lines: [{ accountCode: '400', amount: 0 }] }).success
    ).toBe(false);
    expect(
      manualJournalSchema.safeParse({
        ...base,
        lines: [
          { accountCode: '', amount: 10 },
          { accountCode: '825', amount: -10 },
        ],
      }).success
    ).toBe(false);
  });
});

describe('journal editor maths', () => {
  it('totals debits and credits in cents and signs lines', () => {
    const lines = [
      { description: 'a', accountCode: '400', taxType: '', debit: '0.10', credit: '' },
      { description: '', accountCode: '401', taxType: '', debit: '0.20', credit: '' },
      { description: '', accountCode: '825', taxType: '', debit: '', credit: '0.30' },
      { description: '', accountCode: '', taxType: '', debit: '', credit: '' },
    ];
    expect(journalTotals(lines)).toEqual({ debit: 30, credit: 30, difference: 0 });
    expect(toJournalLines(lines)).toEqual([
      { accountCode: '400', description: 'a', taxType: undefined, amount: 0.1 },
      { accountCode: '401', description: undefined, taxType: undefined, amount: 0.2 },
      { accountCode: '825', description: undefined, taxType: undefined, amount: -0.3 },
    ]);
  });
});
