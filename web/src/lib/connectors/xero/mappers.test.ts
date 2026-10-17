import { describe, expect, it } from 'vitest';
import { fromXeroInvoice } from './mappers';
import { xeroDate } from './client';
import { fromXeroReport, findReportValue } from './reports';

describe('xero mappers', () => {
  it('parses Xero /Date()/ values', () => {
    expect(xeroDate('/Date(1760313600000+0000)/')).toBe('2025-10-13');
    expect(xeroDate('2026-01-31T00:00:00')).toBe('2026-01-31');
    expect(xeroDate(undefined)).toBeUndefined();
  });

  it('maps an overdue authorised invoice', () => {
    const invoice = fromXeroInvoice({
      InvoiceID: 'i1',
      InvoiceNumber: 'INV-1',
      Type: 'ACCREC',
      Contact: { ContactID: 'c1', Name: 'Contoso' },
      DateString: '2020-01-01T00:00:00',
      DueDateString: '2020-01-31T00:00:00',
      Status: 'AUTHORISED',
      LineAmountTypes: 'Exclusive',
      SubTotal: 100,
      TotalTax: 20,
      Total: 120,
      AmountDue: 120,
      AmountPaid: 0,
      CurrencyCode: 'GBP',
    });
    expect(invoice).toMatchObject({
      type: 'sales',
      status: 'authorised',
      isOverdue: true,
      lineAmountType: 'exclusive',
      dueDate: '2020-01-31',
    });
  });

  it('flattens a report and finds totals', () => {
    const report = fromXeroReport('profit-and-loss', {
      ReportName: 'ProfitAndLoss',
      ReportTitles: ['Profit & Loss', 'Contoso', 'Jan 2026'],
      Rows: [
        { RowType: 'Header', Cells: [{ Value: '' }, { Value: 'Jan 26' }] },
        {
          RowType: 'Section',
          Title: 'Income',
          Rows: [
            {
              RowType: 'Row',
              Cells: [
                { Value: 'Sales', Attributes: [{ Id: 'account', Value: 'a1' }] },
                { Value: '100.00' },
              ],
            },
            { RowType: 'SummaryRow', Cells: [{ Value: 'Total Income' }, { Value: '100.00' }] },
          ],
        },
        {
          RowType: 'Section',
          Title: '',
          Rows: [{ RowType: 'Row', Cells: [{ Value: 'Net Profit' }, { Value: '40.00' }] }],
        },
      ],
    });
    expect(report.columns).toEqual(['', 'Jan 26']);
    expect(report.sections[0].rows[0].accountId).toBe('a1');
    expect(findReportValue(report, /^Total Income$/)).toBe(100);
    expect(findReportValue(report, /^Net Profit$/)).toBe(40);
  });
});
