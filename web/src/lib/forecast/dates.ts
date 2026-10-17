/** UTC date arithmetic on ISO `YYYY-MM-DD` strings (no time zones, no DST surprises). */
import type { IsoDate } from '@/lib/domain/types';

const parse = (iso: IsoDate) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
/** Newer ICU writes September as "Sept" in en-GB; Xero (and the rest of Bookie) says "Sep". */
const sep = (text: string) => text.replace('Sept', 'Sep');

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

/** Last day of the month `iso` falls in. */
export function monthEnd(iso: IsoDate): IsoDate {
  const d = parse(iso);
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function monthStart(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`;
}

/**
 * `months` calendar months after `iso`, on the same day of the month, clamped
 * to the month's last day (31 Jan + 1 month = 28/29 Feb).
 */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const d = parse(iso);
  const day = d.getUTCDate();
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return fmt(first);
}

/** Monday of the ISO week `iso` falls in. */
export function weekStart(iso: IsoDate): IsoDate {
  const d = parse(iso);
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -offset);
}

/** Days from `from` to `to`, inclusive of both. */
export function daysInclusive(from: IsoDate, to: IsoDate): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000) + 1;
}

/** `3 Nov` */
export function dayMonth(iso: IsoDate): string {
  return sep(
    parse(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  );
}

/** `Nov 2026` */
export function monthYear(iso: IsoDate): string {
  return sep(
    parse(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  );
}

/** `Nov` */
export function monthShort(iso: IsoDate): string {
  return sep(parse(iso).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }));
}
