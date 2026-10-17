import type { BcClient, ODataList } from '../client';
import { ConnectorError, type ReportsModule } from '../../types';
import type { Report, ReportId, ReportParams, ReportRow, ReportSection } from '@/lib/domain/types';
import { bcFiscalYear } from '../fiscal-year';
import {
  asAtLabel,
  columnLabel,
  monthEnd,
  monthStart,
  rangeLabel,
  shiftDate,
  shiftRange,
  type DateRange,
} from '@/lib/reports/periods';

/**
 * Business Central's financial-report API pages. BC has no bank summary or
 * executive summary page, so those are not offered here.
 */
const AVAILABLE: ReportId[] = [
  'profit-and-loss',
  'balance-sheet',
  'trial-balance',
  'aged-receivables',
  'aged-payables',
  'cash-flow',
];

/* ------------------------------------------------------------------ */
/* Raw shapes                                                          */
/* ------------------------------------------------------------------ */

export interface BcStatementLine {
  lineNumber: number;
  display: string;
  lineType: 'header' | 'detail' | 'total' | 'spacer' | string;
  indentation?: number;
  netChange?: number;
  balance?: number;
}

export interface BcTrialBalanceLine {
  number: string;
  display: string;
  accountType: string;
  totalDebit?: string;
  totalCredit?: string;
  balanceAtDateDebit?: string;
  balanceAtDateCredit?: string;
}

export interface BcAgedLine {
  customerId?: string;
  vendorId?: string;
  name: string;
  balanceDue?: number;
  currentAmount?: number;
  period1Label?: string;
  period1Amount?: number;
  period2Label?: string;
  period2Amount?: number;
  period3Label?: string;
  period3Amount?: number;
  periodLengthFilter?: string;
}

/* ------------------------------------------------------------------ */
/* Mappers                                                             */
/* ------------------------------------------------------------------ */

/**
 * BC formats trial-balance amounts as display strings ("44,850.00", or
 * "44.850,00" in some locales). The last separator followed by two digits is
 * the decimal point.
 */
export function parseBcAmount(value: string | undefined): number {
  if (!value) return 0;
  const trimmed = value.trim();
  const decimal = /[.,](\d{1,2})$/.exec(trimmed);
  const integer = (decimal ? trimmed.slice(0, decimal.index) : trimmed).replace(/[^\d-]/g, '');
  const n = Number(`${integer || '0'}${decimal ? `.${decimal[1]}` : ''}`);
  return Number.isFinite(n) ? n : 0;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * BC's statement pages (incomeStatements, balanceSheets, cashFlowStatements)
 * return flat lines with a lineType. `header` opens a section, `detail` is a
 * row, `total` a summary row and `spacer` closes the section. A total that is
 * less indented than the open section (Total Assets after Fixed Assets) gets
 * its own untitled section, as Xero lays it out.
 *
 * `periods` holds one line set per column, all from the same financial report,
 * matched by lineNumber.
 */
export function fromBcStatement(options: {
  id: ReportId;
  title: string;
  subtitles: string[];
  columns: string[];
  periods: BcStatementLine[][];
  value: 'netChange' | 'balance';
  /** Negate every amount (income statements configured credit-negative). */
  flip?: boolean;
}): Report {
  const [first = []] = options.periods;
  const byLine = options.periods.map(
    (lines) => new Map(lines.map((l) => [l.lineNumber, l[options.value]]))
  );
  const sign = options.flip ? -1 : 1;
  // A line or amount BC didn't return for a column is blank (null), not zero.
  const values = (lineNumber: number) =>
    byLine.map((m) => {
      const raw = m.get(lineNumber);
      if (typeof raw !== 'number') return null;
      const v = round(sign * raw);
      return v === 0 ? 0 : v; // no -0
    });

  const sections: ReportSection[] = [];
  let current: { section: ReportSection; indent: number } | undefined;
  const open = (title: string | undefined, indent: number) => {
    const section: ReportSection = { title, rows: [] };
    sections.push(section);
    current = { section, indent };
    return current;
  };

  for (const line of [...first].sort((a, b) => a.lineNumber - b.lineNumber)) {
    const indent = line.indentation ?? 0;
    switch (line.lineType) {
      case 'header':
        open(line.display || undefined, indent);
        break;
      case 'spacer':
        current = undefined;
        break;
      case 'total': {
        const target = current && indent >= current.indent ? current : open(undefined, indent);
        target.section.rows.push({
          kind: 'summary',
          cells: [line.display || 'Total', ...values(line.lineNumber)],
        });
        break;
      }
      default: {
        const target = current ?? open(undefined, indent);
        target.section.rows.push({
          kind: 'row',
          cells: [line.display, ...values(line.lineNumber)],
        });
      }
    }
  }

  return {
    id: options.id,
    title: options.title,
    subtitles: options.subtitles,
    columns: ['', ...options.columns],
    sections: sections.filter((s) => s.title || s.rows.length),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Whether an income statement reports income as a negative (credit) amount.
 * BC's standard financial report shows income positive ("Show Opposite Sign"),
 * but companies can configure it either way, so look at the data.
 */
export function incomeIsCreditNegative(periods: BcStatementLine[][]): boolean {
  for (const lines of periods) {
    const income = lines.find(
      (l) =>
        l.lineType === 'total' && /^total (income|revenue|sales)/i.test(l.display) && l.netChange
    );
    if (income) return income.netChange! < 0;
  }
  return false;
}

/**
 * BC trial balance → Xero's layout: Debit/Credit are balances as at the date,
 * YTD Debit/Credit the movement since the start of the financial year. Top-level
 * totalling groups (Income, Assets...) become sections; zero accounts are hidden.
 * Pass `ytd: false` when BC has no financial year set up: the YTD columns are
 * then left out rather than computed from a guessed year start.
 */
export function fromBcTrialBalance(options: {
  title: string;
  subtitles: string[];
  lines: BcTrialBalanceLine[];
  ytd?: boolean;
  note?: string;
}): Report {
  const ytd = options.ytd ?? true;
  const sections: ReportSection[] = [];
  let current: ReportSection | undefined;
  let depth = 0;
  const totals = ytd ? [0, 0, 0, 0] : [0, 0];
  for (const line of options.lines) {
    const type = line.accountType.replace(/_x002D_/g, '-');
    const amounts = [
      parseBcAmount(line.balanceAtDateDebit),
      parseBcAmount(line.balanceAtDateCredit),
      ...(ytd ? [parseBcAmount(line.totalDebit), parseBcAmount(line.totalCredit)] : []),
    ];
    if (type === 'Begin-Total') {
      if (depth === 0) {
        current = { title: line.display, rows: [] };
        sections.push(current);
      }
      depth++;
    } else if (type === 'End-Total') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && current && current.rows.length) {
        current.rows.push({ kind: 'summary', cells: [line.display, ...amounts.map(round)] });
      }
    } else if (type === 'Posting') {
      if (amounts.every((a) => a === 0)) continue;
      if (!current) {
        current = { rows: [] };
        sections.push(current);
      }
      amounts.forEach((a, i) => (totals[i] += a));
      current.rows.push({
        kind: 'row',
        cells: [`${line.display} (${line.number})`, ...amounts.map(round)],
        accountId: line.number,
      });
    }
  }
  const kept = sections.filter((s) => s.rows.some((r) => r.kind === 'row'));
  kept.push({ rows: [{ kind: 'summary', cells: ['Total', ...totals.map(round)] }] });
  return {
    id: 'trial-balance',
    title: options.title,
    subtitles: options.subtitles,
    columns: ['Account', 'Debit', 'Credit', ...(ytd ? ['YTD Debit', 'YTD Credit'] : [])],
    sections: kept,
    generatedAt: new Date().toISOString(),
    ...(options.note ? { note: options.note } : {}),
  };
}

const NO_ID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;

/** "30D" → "1–30 days", "31–60 days", "Over 60 days"; "1M" → "1 month"... */
export function agedPeriodLabels(lengthFilter: string | undefined, fallback: string[]): string[] {
  const days = /^(\d+)D$/i.exec(lengthFilter ?? '');
  if (days) {
    const n = Number(days[1]);
    return [`1–${n} days`, `${n + 1}–${2 * n} days`, `Over ${2 * n} days`];
  }
  const months = /^(\d+)M$/i.exec(lengthFilter ?? '');
  if (months) {
    const n = Number(months[1]);
    return [`< ${n} month${n > 1 ? 's' : ''}`, `${n}–${2 * n} months`, `Over ${2 * n} months`];
  }
  return fallback;
}

/** BC's aged receivables/payables pages: one row per party plus BC's own total line. */
export function fromBcAged(options: {
  id: Extract<ReportId, 'aged-receivables' | 'aged-payables'>;
  title: string;
  subtitles: string[];
  party: string;
  lines: BcAgedLine[];
}): Report {
  const isTotal = (l: BcAgedLine) => NO_ID.test(l.customerId ?? l.vendorId ?? '') || !l.name;
  const amounts = (l: BcAgedLine) =>
    [l.currentAmount, l.period1Amount, l.period2Amount, l.period3Amount, l.balanceDue].map((n) =>
      round(n ?? 0)
    );
  const parties = options.lines
    .filter((l) => !isTotal(l) && l.balanceDue)
    .sort((a, b) => a.name.localeCompare(b.name));
  const sample = options.lines.find((l) => l.period1Label) ?? options.lines[0];
  const labels = agedPeriodLabels(sample?.periodLengthFilter, [
    sample?.period1Label || 'Period 1',
    sample?.period2Label || 'Period 2',
    sample?.period3Label || 'Period 3',
  ]);
  const totalLine = options.lines.find(isTotal);
  const total = totalLine
    ? amounts(totalLine)
    : parties.reduce((sum, l) => sum.map((s, i) => round(s + amounts(l)[i])), [0, 0, 0, 0, 0]);
  const rows: ReportRow[] = parties.map((l) => ({ kind: 'row', cells: [l.name, ...amounts(l)] }));
  rows.push({ kind: 'summary', cells: ['Total', ...total] });
  return {
    id: options.id,
    title: options.title,
    subtitles: options.subtitles,
    columns: [options.party, 'Current', ...labels, 'Total'],
    sections: [{ rows }],
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

const today = () => new Date().toISOString().slice(0, 10);

interface BcCompanyInformation {
  displayName?: string;
}

export function bcReports(client: BcClient, lcy: () => Promise<string>): ReportsModule {
  void lcy;
  let info: Promise<BcCompanyInformation> | undefined;
  const company = () =>
    (info ??= client
      .request<ODataList<BcCompanyInformation>>('companyInformation')
      .then((r) => r.value[0] ?? {})
      .catch((): BcCompanyInformation => ({})));

  const statement = (page: string, filter: string) =>
    client.all<BcStatementLine>(page, { $filter: filter });
  const rangeFilter = (r: DateRange) => `dateFilter ge ${r.from} and dateFilter le ${r.to}`;

  /** Start of the financial year containing a date, from BC's accounting periods. */
  const fiscalYear = bcFiscalYear(client);

  const ranges = (params: ReportParams): DateRange[] => {
    const base = {
      from: params.from ?? monthStart(today()),
      to: params.to ?? monthEnd(today()),
    };
    return Array.from({ length: 1 + (params.periods ?? 0) }, (_, i) =>
      shiftRange(base, params.timeframe ?? 'month', i)
    );
  };

  return {
    available: AVAILABLE,
    async run(id: ReportId, params: ReportParams = {}) {
      const name = (await company()).displayName ?? '';
      switch (id) {
        case 'profit-and-loss':
        case 'cash-flow': {
          const periods = ranges(params);
          const page = id === 'profit-and-loss' ? 'incomeStatements' : 'cashFlowStatements';
          const lines = await Promise.all(periods.map((r) => statement(page, rangeFilter(r))));
          return fromBcStatement({
            id,
            title: id === 'profit-and-loss' ? 'Income Statement' : 'Cash Flow Statement',
            subtitles: [name, rangeLabel(periods[0])],
            columns: periods.map(columnLabel),
            periods: lines,
            value: 'netChange',
            flip: id === 'profit-and-loss' && incomeIsCreditNegative(lines),
          });
        }
        case 'balance-sheet': {
          const date = params.date ?? today();
          const dates = Array.from({ length: 1 + (params.periods ?? 0) }, (_, i) =>
            shiftDate(date, params.timeframe ?? 'month', i)
          );
          const lines = await Promise.all(
            dates.map((d) => statement('balanceSheets', `dateFilter eq ${d}`))
          );
          return fromBcStatement({
            id,
            title: 'Balance Sheet',
            subtitles: [name, asAtLabel(date)],
            columns: dates.map((d) => columnLabel({ from: d, to: d })),
            periods: lines,
            value: 'balance',
          });
        }
        case 'trial-balance': {
          const date = params.date ?? today();
          const fy = await fiscalYear(date);
          // Balances at the date don't depend on the range start; YTD columns need the real FY.
          const lines = await client.all<BcTrialBalanceLine>('trialBalances', {
            $filter: rangeFilter({ from: fy.start ?? date, to: date }),
          });
          return fromBcTrialBalance({
            title: 'Trial Balance',
            subtitles: [name, asAtLabel(date)],
            lines,
            ytd: !!fy.start,
            note: fy.note && `${fy.note} Year-to-date columns aren't shown.`,
          });
        }
        case 'aged-receivables':
        case 'aged-payables': {
          const receivables = id === 'aged-receivables';
          const lines = await client.all<BcAgedLine>(
            receivables ? 'agedAccountsReceivables' : 'agedAccountsPayables'
          );
          return fromBcAged({
            id,
            title: receivables ? 'Aged Accounts Receivable' : 'Aged Accounts Payable',
            subtitles: [name, `${asAtLabel(today())} · Ageing by due date`],
            party: receivables ? 'Customer' : 'Vendor',
            lines,
          });
        }
        default:
          throw new ConnectorError(
            'Business Central has no API for this report.',
            404,
            'business-central'
          );
      }
    },
  };
}
