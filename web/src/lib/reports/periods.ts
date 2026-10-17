/**
 * Date arithmetic for the Reporting tab: presets (this month, last financial
 * year...), comparison periods and Xero-style date labels. Everything works
 * on ISO dates in UTC so server and browser agree.
 */
import type { IsoDate } from '@/lib/domain/types';

export type Timeframe = 'month' | 'quarter' | 'year';

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (value: IsoDate) => new Date(`${value.slice(0, 10)}T00:00:00Z`);

export function monthStart(value: IsoDate): IsoDate {
  const d = parse(value);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

export function monthEnd(value: IsoDate): IsoDate {
  const d = parse(value);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const d = parse(value);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** Add months, clamping the day to the target month's length (31 Jan + 1 = 28/29 Feb). */
export function addMonths(value: IsoDate, months: number): IsoDate {
  const d = parse(value);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0));
  target.setUTCDate(Math.min(d.getUTCDate(), last.getUTCDate()));
  return iso(target);
}

export function isMonthEnd(value: IsoDate): boolean {
  return monthEnd(value) === value.slice(0, 10);
}

/** The financial year containing `on`, given the year-end day and month (Xero's convention). */
export function financialYear(on: IsoDate, endDay = 31, endMonth = 12): DateRange {
  const d = parse(on);
  const yearEnd = (year: number) => {
    const last = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
    return iso(new Date(Date.UTC(year, endMonth - 1, Math.min(endDay, last))));
  };
  let end = yearEnd(d.getUTCFullYear());
  if (end < on) end = yearEnd(d.getUTCFullYear() + 1);
  const previousEnd = yearEnd(parse(end).getUTCFullYear() - 1);
  return { from: addDays(previousEnd, 1), to: end };
}

export function calendarQuarter(on: IsoDate): DateRange {
  const d = parse(on);
  const startMonth = Math.floor(d.getUTCMonth() / 3) * 3;
  const from = iso(new Date(Date.UTC(d.getUTCFullYear(), startMonth, 1)));
  return { from, to: monthEnd(addMonths(from, 2)) };
}

export interface RangePreset extends DateRange {
  key: string;
  label: string;
}

export interface DatePreset {
  key: string;
  label: string;
  date: IsoDate;
}

/** Presets for period reports (P&L, bank summary, cash flow), in Xero's order. */
export function rangePresets(
  today: IsoDate,
  fyEndDay?: number,
  fyEndMonth?: number
): RangePreset[] {
  const fy = financialYear(today, fyEndDay, fyEndMonth);
  const lastFy = financialYear(addDays(fy.from, -1), fyEndDay, fyEndMonth);
  const lastMonth = addMonths(monthStart(today), -1);
  const quarter = calendarQuarter(today);
  const lastQuarter = calendarQuarter(addDays(quarter.from, -1));
  return [
    { key: 'this-month', label: 'This month', from: monthStart(today), to: monthEnd(today) },
    { key: 'last-month', label: 'Last month', from: lastMonth, to: monthEnd(lastMonth) },
    { key: 'this-quarter', label: 'This quarter', ...quarter },
    { key: 'last-quarter', label: 'Last quarter', ...lastQuarter },
    { key: 'this-fy', label: 'This financial year', ...fy },
    { key: 'last-fy', label: 'Last financial year', ...lastFy },
    { key: 'fy-to-date', label: 'Year to date', from: fy.from, to: today },
  ];
}

/** Presets for point-in-time reports (balance sheet, trial balance). */
export function datePresets(today: IsoDate, fyEndDay?: number, fyEndMonth?: number): DatePreset[] {
  const fy = financialYear(today, fyEndDay, fyEndMonth);
  return [
    { key: 'today', label: 'Today', date: today },
    { key: 'end-of-month', label: 'End of this month', date: monthEnd(today) },
    { key: 'end-of-last-month', label: 'End of last month', date: addDays(monthStart(today), -1) },
    {
      key: 'end-of-last-quarter',
      label: 'End of last quarter',
      date: addDays(calendarQuarter(today).from, -1),
    },
    { key: 'end-of-last-fy', label: 'End of last financial year', date: addDays(fy.from, -1) },
  ];
}

const MONTHS_PER: Record<Timeframe, number> = { month: 1, quarter: 3, year: 12 };

/**
 * The range `steps` periods before `range`. Month-end-aligned ranges stay
 * month-end-aligned (30 Sep → 31 Aug), so "compare with previous months"
 * gives whole months like Xero does.
 */
export function shiftRange(range: DateRange, timeframe: Timeframe, steps: number): DateRange {
  const months = -MONTHS_PER[timeframe] * steps;
  const to = isMonthEnd(range.to)
    ? monthEnd(addMonths(monthStart(range.to), months))
    : addMonths(range.to, months);
  return { from: addMonths(range.from, months), to };
}

export function shiftDate(date: IsoDate, timeframe: Timeframe, steps: number): IsoDate {
  return shiftRange({ from: date, to: date }, timeframe, steps).to;
}

function long(value: IsoDate) {
  return parse(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function short(value: IsoDate, withYear = true) {
  return parse(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/** "1 April 2026 to 17 October 2026", as in Xero's report subtitles. */
export function rangeLabel({ from, to }: DateRange): string {
  return `${long(from)} to ${long(to)}`;
}

export function asAtLabel(date: IsoDate): string {
  return `As at ${long(date)}`;
}

/** A compact column heading: "Oct 2026", "Jul–Sep 2026", or "1 Oct–17 Oct 2026". */
export function columnLabel(range: DateRange): string {
  // en-GB says "Sept"; Xero (and most UK reports) say "Sep".
  return rawColumnLabel(range).replace(/\bSept\b/g, 'Sep');
}

function rawColumnLabel({ from, to }: DateRange): string {
  if (from === to) return short(to);
  const f = parse(from);
  const t = parse(to);
  const monthYear = (d: Date) =>
    d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const wholeMonths = from === monthStart(from) && isMonthEnd(to);
  if (wholeMonths && f.getUTCFullYear() === t.getUTCFullYear()) {
    if (f.getUTCMonth() === t.getUTCMonth()) return monthYear(f);
    const m = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    return `${m(f)}–${m(t)} ${t.getUTCFullYear()}`;
  }
  if (wholeMonths) return `${monthYear(f)}–${monthYear(t)}`;
  const sameYear = f.getUTCFullYear() === t.getUTCFullYear();
  return `${short(from, !sameYear)}–${short(to)}`;
}

/** Whole calendar months a range touches, e.g. 15 Jan–2 Mar = 3. */
export function monthsTouched({ from, to }: DateRange): number {
  const f = parse(from);
  const t = parse(to);
  return (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth()) + 1;
}
