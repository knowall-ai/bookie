import { describe, expect, it } from 'vitest';
import type { Report } from '@/lib/domain/types';
import { financialYearStart, incomeAndExpenses } from './index';
import { fromXeroContact, fromXeroInvoice } from './mappers';
import { fromXeroTaxRate } from './modules/tax-rates';
import { fromXeroCreditNote } from './modules/credit-notes';
import { fromXeroAccount } from './modules/accounts';

/* Fixtures are shaped like Xero API responses, with fictional values. */

describe('xero: no assumed values', () => {
  it('works out the financial year start from Xero year end, including on the year-end day', () => {
    expect(financialYearStart(31, 3, '2026-10-17')).toBe('2026-04-01');
    expect(financialYearStart(31, 3, '2026-03-31')).toBe('2025-04-01');
    expect(financialYearStart(31, 3, '2026-04-01')).toBe('2026-04-01');
    expect(financialYearStart(31, 12, '2026-12-31')).toBe('2026-01-01');
  });

  it('has no financial year when Xero gives no year end (never 31 December)', () => {
    expect(financialYearStart(undefined, undefined, '2026-10-17')).toBeUndefined();
  });

  it('reads a P&L column only when it has a Net Profit line', () => {
    const report = (rows: [string, number][]): Report => ({
      id: 'profit-and-loss',
      title: 'Profit and Loss',
      subtitles: [],
      columns: ['', 'Oct'],
      sections: [{ rows: rows.map(([l, v]) => ({ kind: 'summary', cells: [l, v] })) }],
      generatedAt: '',
    });
    expect(
      incomeAndExpenses(
        report([
          ['Total Income', 100],
          ['Net Profit', 40],
        ]),
        1
      )
    ).toEqual({ income: 100, expenses: 60, net: 40 });
    expect(incomeAndExpenses(report([['Total Income', 100]]), 1)).toBeUndefined();
  });

  it('leaves a missing amount due unknown rather than 0', () => {
    const invoice = fromXeroInvoice({
      InvoiceID: 'i1',
      Type: 'ACCPAY',
      Contact: { ContactID: 'c1', Name: 'Northwind' },
      Status: 'AUTHORISED',
      Total: 50,
    });
    expect(invoice.amountDue).toBeUndefined();
    expect(invoice.amountPaid).toBeUndefined();
  });

  it('shows a tax rate with no percentage as unknown, not 0%', () => {
    expect(fromXeroTaxRate({ Name: 'Odd rate', TaxType: 'X', Status: 'ACTIVE' }).rate).toBe(
      undefined
    );
    expect(
      fromXeroTaxRate({ Name: 'Zero', TaxType: 'ZERO', EffectiveRate: 0, Status: 'ACTIVE' }).rate
    ).toBe(0);
  });

  it("uses Xero's remaining credit on approved credit notes, without falling back to the total", () => {
    const note = fromXeroCreditNote({
      CreditNoteID: 'cn1',
      Type: 'ACCRECCREDIT',
      Contact: { ContactID: 'c1', Name: 'Northwind' },
      Status: 'AUTHORISED',
      Total: 30,
    });
    expect(note.remainingCredit).toBeUndefined();
  });

  it('keeps an unknown account class unknown (not an asset)', () => {
    const account = fromXeroAccount({
      AccountID: 'a1',
      Code: '999',
      Name: 'Mystery',
      Type: 'NEWTYPE',
      Status: 'ACTIVE',
    });
    expect(account.class).toBeUndefined();
  });

  it('treats a full contact with no Balances as owing nothing (Xero omits zero balances)', () => {
    const contact = fromXeroContact({ ContactID: 'c1', Name: 'Contoso' }, true);
    expect(contact.balances).toEqual({
      receivable: 0,
      payable: 0,
      overdueReceivable: 0,
      overduePayable: 0,
    });
    // A summary row (no Balances requested) says nothing about balances.
    expect(fromXeroContact({ ContactID: 'c1', Name: 'Contoso' }).balances).toBeUndefined();
  });
});
