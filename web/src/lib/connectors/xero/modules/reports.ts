import type { XeroClient } from '../client';
import { ConnectorError, type ReportsModule } from '../../types';
import type { Report, ReportId, ReportParams } from '@/lib/domain/types';
import { fromXeroReport, type XeroReport } from '../reports';
import { xeroDate } from '../client';
import type { XeroInvoice } from '../mappers';
import { buildAgedReport, type AgedItem } from '@/lib/reports/aged';
import { asAtLabel } from '@/lib/reports/periods';

const AVAILABLE: ReportId[] = [
  'profit-and-loss',
  'balance-sheet',
  'trial-balance',
  'aged-receivables',
  'aged-payables',
  'bank-summary',
  'executive-summary',
];

const TIMEFRAME = { month: 'MONTH', quarter: 'QUARTER', year: 'YEAR' } as const;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Xero puts single-line totals (Gross Profit, Net Profit, Net Assets) in
 * untitled sections as plain rows. Mark them as summary rows so they render
 * bold, as in Xero. Account rows (bank accounts in Bank Summary) are left alone.
 */
export function promoteXeroTotals(report: Report): Report {
  return {
    ...report,
    sections: report.sections.map((section) =>
      section.title
        ? section
        : {
            ...section,
            rows: section.rows.map((row) =>
              row.kind === 'row' && !row.accountId ? { ...row, kind: 'summary' as const } : row
            ),
          }
    ),
  };
}

/** Keep the first `count` columns (Xero's balance sheet adds a prior-year column by default). */
export function keepColumns(report: Report, count: number): Report {
  return {
    ...report,
    columns: report.columns.slice(0, count),
    sections: report.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) => ({ ...r, cells: r.cells.slice(0, count) })),
    })),
  };
}

type RawInvoice = XeroInvoice & { CurrencyRate?: number };

/** Outstanding invoice → base-currency amount due (Xero rates are base → foreign). */
export function toAgedItem(invoice: RawInvoice, baseCurrency: string): AgedItem {
  const due = invoice.AmountDue ?? 0;
  const foreign = invoice.CurrencyCode && invoice.CurrencyCode !== baseCurrency;
  const amount = foreign && invoice.CurrencyRate ? due / invoice.CurrencyRate : due;
  return {
    contactId: invoice.Contact.ContactID,
    contactName: invoice.Contact.Name,
    dueDate: xeroDate(invoice.DueDateString ?? invoice.DueDate),
    amount,
  };
}

export function xeroReports(client: XeroClient): ReportsModule {
  let org: Promise<{ Name: string; BaseCurrency: string }> | undefined;
  const organisation = () =>
    (org ??= client
      .request<{ Organisations: { Name: string; BaseCurrency: string }[] }>('Organisation')
      .then((r) => r.Organisations[0]));

  const run = async (
    name: string,
    id: ReportId,
    query: Record<string, string | number | undefined>
  ) => {
    const result = await client.request<{ Reports: XeroReport[] }>(`Reports/${name}`, { query });
    return promoteXeroTotals(fromXeroReport(id, result.Reports[0]));
  };

  /** Every AUTHORISED invoice of one type (summaryOnly pages of 1,000). */
  const outstanding = async (type: 'ACCREC' | 'ACCPAY') => {
    const all: RawInvoice[] = [];
    for (let page = 1; page <= 50; page++) {
      const result = await client.request<{ Invoices: RawInvoice[] }>('Invoices', {
        query: {
          where: `Type=="${type}"`,
          Statuses: 'AUTHORISED',
          summaryOnly: true,
          pageSize: 1000,
          page,
        },
      });
      all.push(...result.Invoices);
      if (result.Invoices.length < 1000) break;
    }
    return all;
  };

  const aged = async (id: 'aged-receivables' | 'aged-payables') => {
    const asAt = today();
    const [details, invoices] = await Promise.all([
      organisation(),
      outstanding(id === 'aged-receivables' ? 'ACCREC' : 'ACCPAY'),
    ]);
    return buildAgedReport({
      id,
      title: id === 'aged-receivables' ? 'Aged Receivables Summary' : 'Aged Payables Summary',
      subtitles: [details.Name, `${asAtLabel(asAt)} · Ageing by due date`],
      asAt,
      items: invoices.map((i) => toAgedItem(i, details.BaseCurrency)),
    });
  };

  return {
    available: AVAILABLE,
    async run(id: ReportId, params: ReportParams = {}) {
      const periods = params.periods || undefined;
      const timeframe = periods ? TIMEFRAME[params.timeframe ?? 'month'] : undefined;
      switch (id) {
        case 'profit-and-loss':
          return run('ProfitAndLoss', id, {
            fromDate: params.from,
            toDate: params.to,
            periods,
            timeframe,
          });
        case 'balance-sheet': {
          const report = await run('BalanceSheet', id, { date: params.date, periods, timeframe });
          // Note: Xero snaps the balance sheet date to the end of that month.
          return periods ? report : keepColumns(report, 2);
        }
        case 'trial-balance':
          return run('TrialBalance', id, { date: params.date });
        case 'bank-summary':
          return run('BankSummary', id, { fromDate: params.from, toDate: params.to });
        case 'executive-summary':
          return run('ExecutiveSummary', id, { date: params.date });
        case 'aged-receivables':
        case 'aged-payables':
          return aged(id);
        default:
          throw new ConnectorError('Xero has no API for this report.', 404, 'xero');
      }
    },
  };
}
