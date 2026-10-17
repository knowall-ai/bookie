/**
 * The reports Bookie knows about, how the Reporting tab groups them, and how a
 * report page turns `?from=&to=` query params into `ReportParams`.
 */
import type { IsoDate, ReportId, ReportParams } from '@/lib/domain/types';
import { datePresets, rangePresets, type Timeframe } from './periods';

export type ReportGroup =
  'Financial performance' | 'Financial position' | 'Receivables and payables' | 'Bank';

export const REPORT_GROUPS: ReportGroup[] = [
  'Financial performance',
  'Financial position',
  'Receivables and payables',
  'Bank',
];

/**
 * - `range`: a from/to period (P&L, bank summary, cash flow)
 * - `date`: a point in time (balance sheet, trial balance)
 * - `month`: the month ending on a date (executive summary)
 * - `today`: always as at today (aged reports are built from what is outstanding now)
 */
export type ReportParamKind = 'range' | 'date' | 'month' | 'today';

export interface ReportDefinition {
  id: ReportId;
  title: string;
  description: string;
  group: ReportGroup;
  params: ReportParamKind;
  /** Offers "compare with previous periods". */
  compare: boolean;
}

export const REPORTS: Record<ReportId, ReportDefinition> = {
  'profit-and-loss': {
    id: 'profit-and-loss',
    title: 'Profit and loss',
    description: 'Income, costs and profit for a period, with optional comparison periods.',
    group: 'Financial performance',
    params: 'range',
    compare: true,
  },
  'executive-summary': {
    id: 'executive-summary',
    title: 'Executive summary',
    description: 'Cash, profitability, position and performance for a month at a glance.',
    group: 'Financial performance',
    params: 'month',
    compare: false,
  },
  'cash-flow': {
    id: 'cash-flow',
    title: 'Cash flow statement',
    description: 'Where cash came from and went: operating, investing and financing.',
    group: 'Financial performance',
    params: 'range',
    compare: false,
  },
  'balance-sheet': {
    id: 'balance-sheet',
    title: 'Balance sheet',
    description: 'Assets, liabilities and equity as at a date.',
    group: 'Financial position',
    params: 'date',
    compare: true,
  },
  'trial-balance': {
    id: 'trial-balance',
    title: 'Trial balance',
    description: 'Debit and credit balances for every account as at a date.',
    group: 'Financial position',
    params: 'date',
    compare: false,
  },
  'aged-receivables': {
    id: 'aged-receivables',
    title: 'Aged receivables summary',
    description: 'What each customer owes you, by how overdue it is.',
    group: 'Receivables and payables',
    params: 'today',
    compare: false,
  },
  'aged-payables': {
    id: 'aged-payables',
    title: 'Aged payables summary',
    description: 'What you owe each supplier, by how overdue it is.',
    group: 'Receivables and payables',
    params: 'today',
    compare: false,
  },
  'bank-summary': {
    id: 'bank-summary',
    title: 'Bank summary',
    description: 'Opening balance, cash received, cash spent and closing balance per account.',
    group: 'Bank',
    params: 'range',
    compare: false,
  },
};

export function isReportId(value: string): value is ReportId {
  return Object.hasOwn(REPORTS, value);
}

export interface ReportSearchParams {
  from?: string;
  to?: string;
  date?: string;
  periods?: string;
  timeframe?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value?: string) =>
  value && ISO.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined;

export interface ResolvedParams extends ReportParams {
  periods: number;
  timeframe: Timeframe;
}

/**
 * Query params → `ReportParams`, defaulting like Xero: P&L and bank summary
 * open on this month, point-in-time reports on today.
 */
export function resolveReportParams(
  definition: ReportDefinition,
  search: ReportSearchParams,
  today: IsoDate,
  fyEnd?: { day?: number; month?: number }
): ResolvedParams {
  const periods = Math.min(11, Math.max(0, Math.trunc(Number(search.periods) || 0)));
  const timeframe: Timeframe =
    search.timeframe === 'quarter' || search.timeframe === 'year' ? search.timeframe : 'month';
  const compare = definition.compare ? { periods, timeframe } : { periods: 0, timeframe };
  switch (definition.params) {
    case 'range': {
      const [thisMonth] = rangePresets(today, fyEnd?.day, fyEnd?.month);
      let from = validDate(search.from) ?? thisMonth.from;
      let to = validDate(search.to) ?? thisMonth.to;
      if (from > to) [from, to] = [to, from];
      return { from, to, ...compare };
    }
    case 'date':
    case 'month': {
      const [todayPreset] = datePresets(today, fyEnd?.day, fyEnd?.month);
      return { date: validDate(search.date) ?? todayPreset.date, ...compare };
    }
    case 'today':
      return { date: today, ...compare };
  }
}
