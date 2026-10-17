/**
 * Aged receivables / payables summary, laid out like Xero's "Aged Receivables
 * Summary": one row per contact, ageing by due date in calendar months.
 *
 * Xero has no API for the summary (only per-contact detail), so the Xero and
 * demo connectors build it from outstanding invoices with this helper.
 */
import type { IsoDate, Report, ReportId, ReportRow } from '@/lib/domain/types';

export const AGED_COLUMNS = ['Current', '< 1 Month', '1 Month', '2 Months', '3 Months', 'Older'];

/**
 * Column index for an amount due on `dueDate`, aged as at `asAt`:
 * not yet due = Current; due earlier in the report month = "< 1 Month";
 * due in the previous calendar month = "1 Month"; and so on, 4+ months = Older.
 */
export function agedBucket(dueDate: IsoDate | undefined, asAt: IsoDate): number {
  if (!dueDate || dueDate >= asAt) return 0;
  const [dy, dm] = dueDate.split('-').map(Number);
  const [ay, am] = asAt.split('-').map(Number);
  const months = (ay - dy) * 12 + (am - dm);
  return Math.min(5, months + 1);
}

export interface AgedItem {
  contactId: string;
  contactName: string;
  dueDate?: IsoDate;
  /** Outstanding amount in the organisation's base currency. */
  amount: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function buildAgedReport(options: {
  id: Extract<ReportId, 'aged-receivables' | 'aged-payables'>;
  title: string;
  subtitles: string[];
  asAt: IsoDate;
  items: AgedItem[];
}): Report {
  const byContact = new Map<string, { name: string; buckets: number[] }>();
  const totals = AGED_COLUMNS.map(() => 0);
  for (const item of options.items) {
    if (!item.amount) continue;
    const entry = byContact.get(item.contactId) ?? {
      name: item.contactName,
      buckets: AGED_COLUMNS.map(() => 0),
    };
    const bucket = agedBucket(item.dueDate, options.asAt);
    entry.buckets[bucket] += item.amount;
    totals[bucket] += item.amount;
    byContact.set(item.contactId, entry);
  }
  const rows: ReportRow[] = [...byContact.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, buckets }) => ({
      kind: 'row',
      cells: [name, ...buckets.map(round), round(buckets.reduce((s, n) => s + n, 0))],
    }));
  rows.push({
    kind: 'summary',
    cells: ['Total', ...totals.map(round), round(totals.reduce((s, n) => s + n, 0))],
  });
  return {
    id: options.id,
    title: options.title,
    subtitles: options.subtitles,
    columns: ['Contact', ...AGED_COLUMNS, 'Total'],
    sections: [{ rows }],
    generatedAt: new Date().toISOString(),
  };
}
