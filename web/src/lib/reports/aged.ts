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
  /** Outstanding amount, in `currency` exactly as the source reports it (never converted). */
  amount: number | undefined;
  /** The document's currency; omitted or equal to the base currency for base-currency documents. */
  currency?: string;
}

const round = (n: number) => Math.round(n * 100) / 100;

function agedRows(items: AgedItem[], asAt: IsoDate, totalLabel: string): ReportRow[] {
  const byContact = new Map<string, { name: string; buckets: number[] }>();
  const totals = AGED_COLUMNS.map(() => 0);
  for (const item of items) {
    if (!item.amount) continue;
    const entry = byContact.get(item.contactId) ?? {
      name: item.contactName,
      buckets: AGED_COLUMNS.map(() => 0),
    };
    const bucket = agedBucket(item.dueDate, asAt);
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
    cells: [totalLabel, ...totals.map(round), round(totals.reduce((s, n) => s + n, 0))],
  });
  return rows;
}

/**
 * Builds the summary. Foreign-currency documents are not converted: Xero's own
 * summary converts them at the report date's exchange rate, which its API
 * doesn't publish, so any conversion here would be a guess. When documents are
 * in more than one currency, each currency gets its own section and total.
 */
export function buildAgedReport(options: {
  id: Extract<ReportId, 'aged-receivables' | 'aged-payables'>;
  title: string;
  subtitles: string[];
  asAt: IsoDate;
  items: AgedItem[];
  baseCurrency?: string;
  source?: string;
}): Report {
  const base = options.baseCurrency ?? '';
  const unknown = options.items.filter((i) => i.amount === undefined).length;
  const groups = new Map<string, AgedItem[]>();
  for (const item of options.items) {
    const currency = item.currency || base;
    groups.set(currency, [...(groups.get(currency) ?? []), item]);
  }
  const currencies = [...groups.keys()].sort((a, b) =>
    a === base ? -1 : b === base ? 1 : a.localeCompare(b)
  );
  const multi = currencies.length > 1;
  const notes = [
    multi
      ? `Amounts are shown in each invoice's own currency. ${options.source ?? 'The source'} converts foreign-currency invoices at the report date's exchange rate, which its API doesn't provide, so Bookie doesn't convert them.`
      : undefined,
    unknown
      ? `${unknown} outstanding ${unknown === 1 ? "document's amount isn't" : "documents' amounts aren't"} reported by ${options.source ?? 'the source'} and ${unknown === 1 ? 'is' : 'are'} left out.`
      : undefined,
  ].filter(Boolean);
  return {
    id: options.id,
    title: options.title,
    subtitles: options.subtitles,
    columns: ['Contact', ...AGED_COLUMNS, 'Total'],
    sections: multi
      ? currencies.map((currency) => ({
          title: currency,
          rows: agedRows(groups.get(currency)!, options.asAt, `Total ${currency}`),
        }))
      : [{ rows: agedRows(options.items, options.asAt, 'Total') }],
    generatedAt: new Date().toISOString(),
    ...(notes.length ? { note: notes.join(' ') } : {}),
  };
}
