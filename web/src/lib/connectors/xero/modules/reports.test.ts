import { describe, expect, it } from 'vitest';
import type { XeroClient } from '../client';
import { keepColumns, promoteXeroTotals, toAgedItem, xeroReports } from './reports';
import { fromXeroReport } from '../reports';

// Shaped like GET Reports/ProfitAndLoss (fictional values).
const PROFIT_AND_LOSS = {
  ReportName: 'Profit and Loss',
  ReportTitles: ['Profit & Loss', 'Contoso Ltd', '1 October 2026 to 31 October 2026'],
  Rows: [
    { RowType: 'Header', Cells: [{ Value: '' }, { Value: '31 Oct 26' }, { Value: '30 Sep 26' }] },
    {
      RowType: 'Section',
      Title: 'Income',
      Rows: [
        {
          RowType: 'Row',
          Cells: [
            { Value: 'Sales', Attributes: [{ Id: 'account', Value: 'acc-1' }] },
            { Value: '1000.00' },
            { Value: '900.00' },
          ],
        },
        {
          RowType: 'SummaryRow',
          Cells: [{ Value: 'Total Income' }, { Value: '1000.00' }, { Value: '900.00' }],
        },
      ],
    },
    {
      RowType: 'Section',
      Title: '',
      Rows: [
        {
          RowType: 'Row',
          Cells: [{ Value: 'Net Profit' }, { Value: '-25.50' }, { Value: '10.00' }],
        },
      ],
    },
  ],
} as const;

function fakeClient(
  responses: Record<string, unknown>,
  calls: { path: string; query?: unknown }[] = []
) {
  return {
    async request(path: string, request?: { query?: Record<string, unknown> }) {
      calls.push({ path, query: request?.query });
      const hit = Object.entries(responses).find(([prefix]) => path.startsWith(prefix));
      if (!hit) throw new Error(`unexpected ${path}`);
      return typeof hit[1] === 'function'
        ? (hit[1] as (q: unknown) => unknown)(request?.query)
        : hit[1];
    },
  } as unknown as XeroClient;
}

describe('xero reports', () => {
  it('marks untitled single rows (Net Profit) as summary rows', () => {
    const report = promoteXeroTotals(fromXeroReport('profit-and-loss', PROFIT_AND_LOSS as never));
    expect(report.subtitles).toEqual(['Contoso Ltd', '1 October 2026 to 31 October 2026']);
    expect(report.sections[0].rows[0]).toMatchObject({ kind: 'row', accountId: 'acc-1' });
    expect(report.sections[1].rows[0]).toMatchObject({
      kind: 'summary',
      cells: ['Net Profit', -25.5, 10],
    });
    expect(keepColumns(report, 2).sections[1].rows[0].cells).toEqual(['Net Profit', -25.5]);
  });

  it('passes dates, periods and timeframe to Xero', async () => {
    const calls: { path: string; query?: unknown }[] = [];
    const reports = xeroReports(
      fakeClient({ 'Reports/ProfitAndLoss': { Reports: [PROFIT_AND_LOSS] } }, calls)
    );
    await reports.run('profit-and-loss', {
      from: '2026-10-01',
      to: '2026-10-31',
      periods: 1,
      timeframe: 'quarter',
    });
    expect(calls[0]).toEqual({
      path: 'Reports/ProfitAndLoss',
      query: { fromDate: '2026-10-01', toDate: '2026-10-31', periods: 1, timeframe: 'QUARTER' },
    });
  });

  it('converts foreign-currency amounts to base currency for ageing', () => {
    const item = toAgedItem(
      {
        InvoiceID: 'i1',
        Type: 'ACCREC',
        Status: 'AUTHORISED',
        Contact: { ContactID: 'c1', Name: 'Fabrikam' },
        DueDateString: '2026-09-30T00:00:00',
        AmountDue: 120,
        CurrencyCode: 'USD',
        CurrencyRate: 1.2,
      },
      'GBP'
    );
    expect(item).toEqual({
      contactId: 'c1',
      contactName: 'Fabrikam',
      dueDate: '2026-09-30',
      amount: 100,
    });
  });

  it('leaves out a foreign-currency invoice with no Xero rate instead of mixing currencies', () => {
    const item = toAgedItem(
      {
        InvoiceID: 'i2',
        Type: 'ACCREC',
        Status: 'AUTHORISED',
        Contact: { ContactID: 'c1', Name: 'Fabrikam' },
        AmountDue: 120,
        CurrencyCode: 'EUR',
      },
      'GBP'
    );
    expect(item).toBeUndefined();
  });

  it('builds the aged receivables summary from outstanding invoices', async () => {
    const calls: { path: string; query?: unknown }[] = [];
    const reports = xeroReports(
      fakeClient(
        {
          Organisation: { Organisations: [{ Name: 'Contoso Ltd', BaseCurrency: 'GBP' }] },
          Invoices: {
            Invoices: [
              {
                InvoiceID: '1',
                Type: 'ACCREC',
                Status: 'AUTHORISED',
                Contact: { ContactID: 'a', Name: 'Northwind' },
                DueDateString: '2099-01-01T00:00:00',
                AmountDue: 50,
                CurrencyCode: 'GBP',
              },
              {
                InvoiceID: '2',
                Type: 'ACCREC',
                Status: 'AUTHORISED',
                Contact: { ContactID: 'b', Name: 'Fabrikam' },
                DueDateString: '2000-01-01T00:00:00',
                AmountDue: 70,
                CurrencyCode: 'GBP',
              },
            ],
          },
        },
        calls
      )
    );
    const report = await reports.run('aged-receivables');
    expect(calls.find((c) => c.path === 'Invoices')?.query).toMatchObject({
      where: 'Type=="ACCREC"',
      Statuses: 'AUTHORISED',
      summaryOnly: true,
      pageSize: 1000,
    });
    const rows = report.sections[0].rows;
    expect(rows.map((r) => r.cells[0])).toEqual(['Fabrikam', 'Northwind', 'Total']);
    expect(rows[2].cells).toEqual(['Total', 50, 0, 0, 0, 0, 70, 120]);
    expect(report.subtitles[0]).toBe('Contoso Ltd');
  });
});
