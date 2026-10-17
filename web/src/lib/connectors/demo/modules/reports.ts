/**
 * Demo reports, computed from the fictional Contoso books so every number on
 * a report ties back to the demo invoices and bank lines (and to the home
 * dashboard, which uses the same income/expense rules).
 */
import type { DemoData, DemoInvoice } from '../data';
import { ConnectorError, type ReportsModule } from '../../types';
import type {
  Invoice,
  IsoDate,
  Report,
  ReportId,
  ReportParams,
  ReportRow,
  ReportSection,
} from '@/lib/domain/types';
import { buildAgedReport } from '@/lib/reports/aged';
import { demoInBase } from './currencies';
import { buildAccountTransactions, buildJournalReport } from '@/lib/reports/ledger';
import { chart, demoLedger } from './accounts';
import { demoLedgerJournals } from './ledger';
import {
  addDays,
  asAtLabel,
  columnLabel,
  financialYear,
  monthEnd,
  monthStart,
  monthsTouched,
  rangeLabel,
  shiftDate,
  shiftRange,
  type DateRange,
} from '@/lib/reports/periods';
import { todayIso } from '@/lib/domain/dates';

const AVAILABLE: ReportId[] = [
  'profit-and-loss',
  'balance-sheet',
  'trial-balance',
  'aged-receivables',
  'aged-payables',
  'bank-summary',
  'executive-summary',
  'cash-flow',
  'account-transactions',
  'journal-report',
];

/** Fixed monthly overheads; together they are the £4,200 the demo dashboard adds per month. */
export const DEMO_OVERHEADS: { code: string; name: string; monthly: number }[] = [
  { code: '400', name: 'Advertising', monthly: 400 },
  { code: '445', name: 'Light, Power, Heating', monthly: 350 },
  { code: '469', name: 'Rent', monthly: 1800 },
  { code: '477', name: 'Salaries', monthly: 1650 },
];

const OPENING_CASH = 18_500;
const SAVINGS = 25_000;
const FUNDS_INTRODUCED = OPENING_CASH + SAVINGS;
/** Contoso's financial year ends 31 March. */
const FY_END = { day: 31, month: 3 };

const round = (n: number) => Math.round(n * 100) / 100;
const sum = (values: number[]) => round(values.reduce((s, n) => s + n, 0));
const today = todayIso;

/** Posted invoices (approved or paid): drafts and those awaiting approval aren't in the books yet. */
const live = (data: DemoData, type: Invoice['type']) =>
  data.invoices
    .filter((i) => i.type === type && (i.status === 'authorised' || i.status === 'paid'))
    .map((i) => demoInBase(i))
    .filter((i): i is DemoInvoice => !!i);

/**
 * The seeded demo books date some payments a few days ahead; treat those as
 * happening today so reports agree with the dashboard's bank balances.
 */
const effective = (date: IsoDate) => (date > today() ? today() : date);

const within = (date: IsoDate, r: DateRange) => date >= r.from && date <= r.to;

export interface DemoProfitAndLoss {
  income: number;
  costOfSales: number;
  overheads: { code: string; name: string; amount: number }[];
  grossProfit: number;
  expenses: number;
  netProfit: number;
}

export function demoProfitAndLoss(data: DemoData, range: DateRange): DemoProfitAndLoss {
  const income = sum(
    live(data, 'sales')
      .filter((i) => within(i.date, range))
      .map((i) => i.subTotal)
  );
  const costOfSales = sum(
    live(data, 'purchase')
      .filter((i) => within(i.date, range))
      .map((i) => i.subTotal)
  );
  const months = monthsTouched(range);
  const overheads = DEMO_OVERHEADS.map((o) => ({ ...o, amount: round(o.monthly * months) }));
  const expenses = sum(overheads.map((o) => o.amount));
  const grossProfit = round(income - costOfSales);
  return {
    income,
    costOfSales,
    overheads,
    grossProfit,
    expenses,
    netProfit: round(grossProfit - expenses),
  };
}

/** Amount still owed on an invoice at the end of `date` (payments dated later don't count yet). */
function outstandingAt(invoice: Invoice, date: IsoDate): number {
  if (invoice.date > date) return 0;
  const paid = (invoice.payments ?? [])
    .filter((p) => effective(p.date) <= date)
    .reduce((s, p) => s + p.amount, 0);
  return round(Math.max(0, invoice.total - paid - (invoice.amountCredited ?? 0)));
}

function cashAt(data: DemoData, date: IsoDate) {
  const current = data.bankTransactions
    .filter((t) => t.status !== 'deleted' && effective(t.date) <= date)
    .reduce(
      (s, t) => s + (t.type === 'receive' || t.type === 'transfer-in' ? t.amount : -t.amount),
      OPENING_CASH
    );
  return { current: round(current), savings: SAVINGS };
}

export interface DemoBalanceSheet {
  bank: { name: string; amount: number }[];
  receivables: number;
  payables: number;
  vat: number;
  currentYearEarnings: number;
  retainedEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  netAssets: number;
}

export function demoBalanceSheet(data: DemoData, date: IsoDate): DemoBalanceSheet {
  const cash = cashAt(data, date);
  const bank = [
    { name: data.bankAccounts[0]?.name ?? 'Business Current Account', amount: cash.current },
    { name: data.bankAccounts[1]?.name ?? 'Business Savings Account', amount: cash.savings },
  ];
  const receivables = sum(live(data, 'sales').map((i) => outstandingAt(i, date)));
  const payables = sum(live(data, 'purchase').map((i) => outstandingAt(i, date)));
  const vat = round(
    sum(
      live(data, 'sales')
        .filter((i) => i.date <= date)
        .map((i) => i.totalTax)
    ) -
      sum(
        live(data, 'purchase')
          .filter((i) => i.date <= date)
          .map((i) => i.totalTax)
      )
  );
  const totalAssets = round(sum(bank.map((b) => b.amount)) + receivables);
  const totalLiabilities = round(payables + vat);
  const netAssets = round(totalAssets - totalLiabilities);
  const fy = financialYear(date, FY_END.day, FY_END.month);
  const currentYearEarnings = demoProfitAndLoss(data, { from: fy.from, to: date }).netProfit;
  return {
    bank,
    receivables,
    payables,
    vat,
    currentYearEarnings,
    // The balancing figure: everything earned before this financial year.
    retainedEarnings: round(netAssets - FUNDS_INTRODUCED - currentYearEarnings),
    totalAssets,
    totalLiabilities,
    netAssets,
  };
}

/** Build a multi-column report from per-column values. */
function columnsReport(
  id: ReportId,
  title: string,
  subtitles: string[],
  columns: string[],
  layout: { title?: string; rows: { label: string; summary?: boolean; values: number[] }[] }[]
): Report {
  const sections: ReportSection[] = layout.map((s) => ({
    title: s.title,
    rows: s.rows.map((r): ReportRow => ({
      kind: r.summary ? 'summary' : 'row',
      cells: [r.label, ...r.values],
    })),
  }));
  return {
    id,
    title,
    subtitles,
    columns: ['', ...columns],
    sections,
    generatedAt: new Date().toISOString(),
  };
}

export function demoReports(
  data: DemoData,
  orgName = 'Contoso Coffee Roasters Ltd'
): ReportsModule {
  const profitAndLoss = (params: ReportParams): Report => {
    const base = { from: params.from ?? monthStart(today()), to: params.to ?? monthEnd(today()) };
    const ranges = Array.from({ length: 1 + (params.periods ?? 0) }, (_, i) =>
      shiftRange(base, params.timeframe ?? 'month', i)
    );
    const pl = ranges.map((r) => demoProfitAndLoss(data, r));
    const col = (f: (p: DemoProfitAndLoss) => number) => pl.map(f);
    return columnsReport(
      'profit-and-loss',
      'Profit and Loss',
      [orgName, rangeLabel(base)],
      ranges.map(columnLabel),
      [
        {
          title: 'Trading Income',
          rows: [
            { label: 'Sales', values: col((p) => p.income) },
            { label: 'Total Trading Income', summary: true, values: col((p) => p.income) },
          ],
        },
        {
          title: 'Cost of Sales',
          rows: [
            { label: 'Cost of Goods Sold', values: col((p) => p.costOfSales) },
            { label: 'Total Cost of Sales', summary: true, values: col((p) => p.costOfSales) },
          ],
        },
        { rows: [{ label: 'Gross Profit', summary: true, values: col((p) => p.grossProfit) }] },
        {
          title: 'Operating Expenses',
          rows: [
            ...DEMO_OVERHEADS.map((o, i) => ({
              label: o.name,
              values: col((p) => p.overheads[i].amount),
            })),
            { label: 'Total Operating Expenses', summary: true, values: col((p) => p.expenses) },
          ],
        },
        { rows: [{ label: 'Net Profit', summary: true, values: col((p) => p.netProfit) }] },
      ]
    );
  };

  const balanceSheet = (params: ReportParams): Report => {
    const date = params.date ?? today();
    const dates = Array.from({ length: 1 + (params.periods ?? 0) }, (_, i) =>
      shiftDate(date, params.timeframe ?? 'month', i)
    );
    const bs = dates.map((d) => demoBalanceSheet(data, d));
    const col = (f: (b: DemoBalanceSheet) => number) => bs.map(f);
    return columnsReport(
      'balance-sheet',
      'Balance Sheet',
      [orgName, asAtLabel(date)],
      dates.map((d) => columnLabel({ from: d, to: d })),
      [
        { title: 'Assets', rows: [] },
        {
          title: 'Bank',
          rows: [
            ...bs[0].bank.map((b, i) => ({ label: b.name, values: col((x) => x.bank[i].amount) })),
            {
              label: 'Total Bank',
              summary: true,
              values: col((x) => sum(x.bank.map((b) => b.amount))),
            },
          ],
        },
        {
          title: 'Current Assets',
          rows: [
            { label: 'Accounts Receivable', values: col((x) => x.receivables) },
            { label: 'Total Current Assets', summary: true, values: col((x) => x.receivables) },
          ],
        },
        { rows: [{ label: 'Total Assets', summary: true, values: col((x) => x.totalAssets) }] },
        { title: 'Liabilities', rows: [] },
        {
          title: 'Current Liabilities',
          rows: [
            { label: 'Accounts Payable', values: col((x) => x.payables) },
            { label: 'VAT', values: col((x) => x.vat) },
            {
              label: 'Total Current Liabilities',
              summary: true,
              values: col((x) => x.totalLiabilities),
            },
          ],
        },
        {
          rows: [
            { label: 'Total Liabilities', summary: true, values: col((x) => x.totalLiabilities) },
          ],
        },
        { rows: [{ label: 'Net Assets', summary: true, values: col((x) => x.netAssets) }] },
        {
          title: 'Equity',
          rows: [
            { label: 'Current Year Earnings', values: col((x) => x.currentYearEarnings) },
            { label: 'Owner A Funds Introduced', values: col(() => FUNDS_INTRODUCED) },
            { label: 'Retained Earnings', values: col((x) => x.retainedEarnings) },
            { label: 'Total Equity', summary: true, values: col((x) => x.netAssets) },
          ],
        },
      ]
    );
  };

  const trialBalance = (params: ReportParams): Report => {
    const date = params.date ?? today();
    const bs = demoBalanceSheet(data, date);
    const fy = financialYear(date, FY_END.day, FY_END.month);
    const pl = demoProfitAndLoss(data, { from: fy.from, to: date });
    const line = (label: string, amount: number, normal: 'debit' | 'credit'): ReportRow => {
      const debit = normal === 'debit' ? amount : -amount;
      return {
        kind: 'row',
        cells: [label, debit > 0 ? round(debit) : null, debit < 0 ? round(-debit) : null],
      };
    };
    const sections: ReportSection[] = [
      {
        title: 'Revenue',
        rows: [line('Sales (200)', pl.income, 'credit')],
      },
      {
        title: 'Expenses',
        rows: [
          line('Cost of Goods Sold (310)', pl.costOfSales, 'debit'),
          ...pl.overheads.map((o) => line(`${o.name} (${o.code})`, o.amount, 'debit')),
        ],
      },
      {
        title: 'Assets',
        rows: [
          ...bs.bank.map((b, i) =>
            line(`${b.name} (${i === 0 ? '090' : '091'})`, b.amount, 'debit')
          ),
          line('Accounts Receivable (610)', bs.receivables, 'debit'),
        ],
      },
      {
        title: 'Liabilities',
        rows: [
          line('Accounts Payable (800)', bs.payables, 'credit'),
          line('VAT (820)', bs.vat, 'credit'),
        ],
      },
      {
        title: 'Equity',
        rows: [
          line('Owner A Funds Introduced (970)', FUNDS_INTRODUCED, 'credit'),
          line('Retained Earnings (960)', bs.retainedEarnings, 'credit'),
        ],
      },
    ].map((s) => ({
      ...s,
      rows: s.rows.filter((r) => r.cells[1] !== null || r.cells[2] !== null),
    }));
    const all = sections.flatMap((s) => s.rows);
    const total = (i: number) =>
      sum(all.map((r) => (typeof r.cells[i] === 'number' ? (r.cells[i] as number) : 0)));
    sections.push({ rows: [{ kind: 'summary', cells: ['Total', total(1), total(2)] }] });
    return {
      id: 'trial-balance',
      title: 'Trial Balance',
      subtitles: [orgName, asAtLabel(date)],
      columns: ['Account', 'Debit', 'Credit'],
      sections: sections.filter((s) => s.rows.length),
      generatedAt: new Date().toISOString(),
    };
  };

  const aged = (id: 'aged-receivables' | 'aged-payables'): Report => {
    const asAt = today();
    const type = id === 'aged-receivables' ? 'sales' : 'purchase';
    return buildAgedReport({
      id,
      title: id === 'aged-receivables' ? 'Aged Receivables Summary' : 'Aged Payables Summary',
      subtitles: [orgName, `${asAtLabel(asAt)} · Ageing by due date`],
      asAt,
      items: data.invoices
        .filter((i) => i.type === type && i.status === 'authorised')
        .map((i) => ({
          contactId: i.contact.id,
          contactName: i.contact.name,
          dueDate: i.dueDate,
          amount: i.amountDue,
          currency: i.currency,
        })),
      baseCurrency: 'GBP',
      source: 'The demo',
    });
  };

  const bankMovements = (range: DateRange) => {
    const inRange = data.bankTransactions.filter(
      (t) => t.status !== 'deleted' && within(effective(t.date), range)
    );
    const received = sum(
      inRange.filter((t) => t.type === 'receive' || t.type === 'transfer-in').map((t) => t.amount)
    );
    const spent = sum(
      inRange.filter((t) => t.type === 'spend' || t.type === 'transfer-out').map((t) => t.amount)
    );
    const opening = cashAt(data, addDays(range.from, -1));
    return { received, spent, opening, closing: cashAt(data, range.to) };
  };

  const bankSummary = (params: ReportParams): Report => {
    const range = { from: params.from ?? monthStart(today()), to: params.to ?? today() };
    const m = bankMovements(range);
    const rows: ReportRow[] = [
      {
        kind: 'row',
        accountId: data.bankAccounts[0]?.id,
        cells: [
          data.bankAccounts[0]?.name ?? 'Business Current Account',
          m.opening.current,
          m.received,
          m.spent,
          m.closing.current,
        ],
      },
      {
        kind: 'row',
        accountId: data.bankAccounts[1]?.id,
        cells: [data.bankAccounts[1]?.name ?? 'Business Savings Account', SAVINGS, 0, 0, SAVINGS],
      },
    ];
    rows.push({
      kind: 'summary',
      cells: [
        'Total',
        round(m.opening.current + SAVINGS),
        m.received,
        m.spent,
        round(m.closing.current + SAVINGS),
      ],
    });
    return {
      id: 'bank-summary',
      title: 'Bank Summary',
      subtitles: [orgName, `From ${rangeLabel(range)}`],
      columns: [
        'Bank Accounts',
        'Opening Balance',
        'Cash Received',
        'Cash Spent',
        'Closing Balance',
      ],
      sections: [{ rows }],
      generatedAt: new Date().toISOString(),
    };
  };

  const cashFlow = (params: ReportParams): Report => {
    const range = { from: params.from ?? monthStart(today()), to: params.to ?? monthEnd(today()) };
    const m = bankMovements(range);
    const net = round(m.received - m.spent);
    return columnsReport(
      'cash-flow',
      'Statement of Cash Flows',
      [orgName, rangeLabel(range)],
      [columnLabel(range)],
      [
        {
          title: 'Operating Activities',
          rows: [
            { label: 'Receipts from customers', values: [m.received] },
            { label: 'Payments to suppliers', values: [-m.spent] },
            { label: 'Net Cash Flows from Operating Activities', summary: true, values: [net] },
          ],
        },
        { rows: [{ label: 'Net Cash Flows', summary: true, values: [net] }] },
        {
          title: 'Cash and Cash Equivalents',
          rows: [
            {
              label: 'Cash and cash equivalents at beginning of period',
              values: [round(m.opening.current + SAVINGS)],
            },
            { label: 'Net change in cash for period', values: [net] },
            {
              label: 'Cash and cash equivalents at end of period',
              summary: true,
              values: [round(m.closing.current + SAVINGS)],
            },
          ],
        },
      ]
    );
  };

  const executiveSummary = (params: ReportParams): Report => {
    const date = params.date ?? today();
    const months = [0, 1].map((k) => {
      const from = monthStart(shiftDate(monthStart(date), 'month', k));
      return { from, to: monthEnd(from) };
    });
    const figures = months.map((r) => {
      const pl = demoProfitAndLoss(data, r);
      const bank = bankMovements(r);
      const bs = demoBalanceSheet(data, r.to);
      const issued = live(data, 'sales').filter((i) => within(i.date, r) && i.status !== 'draft');
      return {
        received: bank.received,
        spent: bank.spent,
        surplus: round(bank.received - bank.spent),
        closing: round(bank.closing.current + SAVINGS),
        income: pl.income,
        direct: pl.costOfSales,
        gross: pl.grossProfit,
        expenses: pl.expenses,
        profit: pl.netProfit,
        debtors: bs.receivables,
        creditors: bs.payables,
        netAssets: bs.netAssets,
        count: issued.length,
        average: issued.length ? round(sum(issued.map((i) => i.total)) / issued.length) : 0,
      };
    });
    type Key = keyof (typeof figures)[number];
    const variance = (key: Key) => {
      const [now, before] = [figures[0][key], figures[1][key]];
      if (!before) return null;
      return `${(((now - before) / Math.abs(before)) * 100).toFixed(1)}%`;
    };
    const row = (label: string, key: Key, summary = false): ReportRow => ({
      kind: summary ? 'summary' : 'row',
      cells: [label, figures[0][key], figures[1][key], variance(key)],
    });
    return {
      id: 'executive-summary',
      title: 'Executive Summary',
      subtitles: [orgName, `For the month of ${columnLabel(months[0])}`],
      columns: ['', columnLabel(months[0]), columnLabel(months[1]), 'Variance'],
      sections: [
        {
          title: 'Cash',
          rows: [
            row('Cash received', 'received'),
            row('Cash spent', 'spent'),
            row('Cash surplus (deficit)', 'surplus', true),
            row('Closing bank balance', 'closing'),
          ],
        },
        {
          title: 'Profitability',
          rows: [
            row('Income', 'income'),
            row('Direct costs', 'direct'),
            row('Gross profit (loss)', 'gross', true),
            row('Expenses', 'expenses'),
            row('Profit (loss)', 'profit', true),
          ],
        },
        {
          title: 'Balance Sheet',
          rows: [
            row('Debtors', 'debtors'),
            row('Creditors', 'creditors'),
            row('Net assets', 'netAssets', true),
          ],
        },
        {
          title: 'Income',
          rows: [
            {
              kind: 'row',
              cells: [
                'Number of invoices issued',
                String(figures[0].count),
                String(figures[1].count),
                variance('count'),
              ],
            },
            row('Average value of invoices', 'average'),
          ],
        },
      ],
      generatedAt: new Date().toISOString(),
    };
  };

  return {
    available: AVAILABLE,
    async run(id, params = {}) {
      switch (id) {
        case 'profit-and-loss':
          return profitAndLoss(params);
        case 'balance-sheet':
          return balanceSheet(params);
        case 'trial-balance':
          return trialBalance(params);
        case 'aged-receivables':
        case 'aged-payables':
          return aged(id);
        case 'bank-summary':
          return bankSummary(params);
        case 'executive-summary':
          return executiveSummary(params);
        case 'cash-flow':
          return cashFlow(params);
        case 'account-transactions':
        case 'journal-report': {
          const now = today();
          const options = {
            orgName,
            from: params.from ?? now,
            to: params.to ?? now,
            journals: demoLedgerJournals(
              demoLedger(data),
              new Map(chart(data).map((a) => [a.code, a.name]))
            ),
          };
          return id === 'account-transactions'
            ? buildAccountTransactions({ ...options, accountCode: params.accountCode })
            : buildJournalReport(options);
        }
        default:
          throw new ConnectorError('Report not found.', 404, 'demo');
      }
    },
  };
}
