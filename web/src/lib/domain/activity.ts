/**
 * Organisation activity: documents and payments per day, as on the Home
 * dashboard's contribution heatmap. Pure functions only, shared by the
 * connectors (aggregation) and the chart (filters, levels, layout, copy).
 */
import type { ActivityDay, IsoDate } from './types';

export type ActivityKind = Exclude<keyof ActivityDay, 'date'>;

export const ACTIVITY_KINDS: ActivityKind[] = [
  'sales',
  'purchases',
  'payments',
  'quotes',
  'creditNotes',
];

export interface ActivityEvent {
  /** Document date; anything after the first 10 characters (a time) is ignored. */
  date: string | undefined | null;
  kind: ActivityKind;
}

const DAY_MS = 86_400_000;

function toTime(iso: IsoDate): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

function toIso(time: number): IsoDate {
  return new Date(time).toISOString().slice(0, 10);
}

export function addDaysIso(iso: IsoDate, days: number): IsoDate {
  return toIso(toTime(iso) + days * DAY_MS);
}

export function emptyDay(date: IsoDate): ActivityDay {
  return { date, sales: 0, purchases: 0, payments: 0, quotes: 0, creditNotes: 0 };
}

/**
 * Count events per day. Returns one entry for every day from `from` to `to`
 * inclusive (zeros included), oldest first. Events outside the range, or
 * without a date, are ignored.
 */
export function aggregateActivity(
  events: Iterable<ActivityEvent>,
  from: IsoDate,
  to: IsoDate
): ActivityDay[] {
  const start = toTime(from);
  const end = toTime(to);
  const days: ActivityDay[] = [];
  for (let t = start; t <= end; t += DAY_MS) days.push(emptyDay(toIso(t)));
  for (const event of events) {
    if (!event.date) continue;
    const t = toTime(event.date);
    if (Number.isNaN(t) || t < start || t > end) continue;
    days[Math.round((t - start) / DAY_MS)][event.kind] += 1;
  }
  return days;
}

/** The last 12 months, starting on a Monday so the grid has whole weeks. */
export function activityRange(today: IsoDate): { from: IsoDate; to: IsoDate } {
  const yearAgo = addDaysIso(today, -364);
  const weekday = (new Date(toTime(yearAgo)).getUTCDay() + 6) % 7; // Monday = 0
  return { from: addDaysIso(yearAgo, -weekday), to: today };
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export type ActivityFilter = 'all' | 'sales' | 'purchases' | 'payments';

export const ACTIVITY_FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sales', label: 'Sales' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'payments', label: 'Payments' },
];

/** What each chip counts. Credit notes can be either side, so only All shows them. */
const FILTER_KINDS: Record<ActivityFilter, ActivityKind[]> = {
  all: ACTIVITY_KINDS,
  sales: ['sales', 'quotes'],
  purchases: ['purchases'],
  payments: ['payments'],
};

export function activityCount(day: ActivityDay, filter: ActivityFilter = 'all'): number {
  return FILTER_KINDS[filter].reduce((sum, kind) => sum + day[kind], 0);
}

export function activityTotal(days: ActivityDay[], filter: ActivityFilter = 'all'): number {
  return days.reduce((sum, day) => sum + activityCount(day, filter), 0);
}

/**
 * Shade 0 (nothing) to 4 (busiest), relative to the busiest day, like GitHub.
 * Any activity is at least level 1 so a single document is always visible.
 */
export function activityLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as 1 | 2 | 3 | 4;
}

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

const NOUNS: Record<ActivityKind, [string, string]> = {
  sales: ['invoice', 'invoices'],
  purchases: ['bill', 'bills'],
  payments: ['payment', 'payments'],
  quotes: ['quote', 'quotes'],
  creditNotes: ['credit note', 'credit notes'],
};

const DISPLAY_ORDER: ActivityKind[] = ['sales', 'purchases', 'payments', 'quotes', 'creditNotes'];

export function formatActivityDate(iso: IsoDate): string {
  return new Date(toTime(iso)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** `14 Mar 2026: 3 invoices, 1 bill, 2 payments` (only the kinds the filter counts). */
export function describeActivity(day: ActivityDay, filter: ActivityFilter = 'all'): string {
  const kinds = new Set(FILTER_KINDS[filter]);
  const parts = DISPLAY_ORDER.filter((k) => kinds.has(k) && day[k] > 0).map(
    (k) => `${day[k]} ${NOUNS[k][day[k] === 1 ? 0 : 1]}`
  );
  return `${formatActivityDate(day.date)}: ${parts.length ? parts.join(', ') : 'no activity'}`;
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/**
 * Columns of seven days, Monday first, as in GitHub's contribution graph.
 * The first week is padded with `null` when the range doesn't start on a Monday.
 */
export function activityWeeks(days: ActivityDay[]): (ActivityDay | null)[][] {
  if (!days.length) return [];
  const pad = (new Date(toTime(days[0].date)).getUTCDay() + 6) % 7;
  const cells: (ActivityDay | null)[] = [...Array<null>(pad).fill(null), ...days];
  const weeks: (ActivityDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Month labels above the grid: one at the first week in which a new month
 * starts. Labels under three weeks after the previous one are dropped so
 * they never overlap.
 */
export function monthLabels(weeks: (ActivityDay | null)[][]): { week: number; label: string }[] {
  const labels: { week: number; label: string }[] = [];
  let lastMonth = '';
  weeks.forEach((week, index) => {
    const first = week.find((d): d is ActivityDay => d !== null);
    if (!first) return;
    const month = first.date.slice(0, 7);
    if (month === lastMonth) return;
    lastMonth = month;
    const label = new Date(toTime(first.date)).toLocaleDateString('en-GB', {
      month: 'short',
      timeZone: 'UTC',
    });
    const previous = labels.at(-1);
    if (previous && index - previous.week < 3) {
      // A part month at the start gives way to the first full one, as on GitHub.
      if (previous.week === 0) labels[labels.length - 1] = { week: index, label };
      return;
    }
    labels.push({ week: index, label });
  });
  return labels;
}
