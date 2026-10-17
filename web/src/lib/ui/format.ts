/** Formatting used everywhere in the portal. en-GB, like Xero UK. */

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  amount: number | null | undefined,
  currency?: string,
  options: { sign?: boolean } = {}
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const key = `${currency ?? ''}:${options.sign ? 's' : ''}`;
  let formatter = moneyFormatters.get(key);
  if (!formatter) {
    formatter = currency
      ? new Intl.NumberFormat('en-GB', {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          signDisplay: options.sign ? 'exceptZero' : 'auto',
        })
      : new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    moneyFormatters.set(key, formatter);
  }
  return formatter.format(amount);
}

/** Compact money for chart axes and big tiles: £12.3k. */
export function formatMoneyCompact(amount: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits }).format(value);
}

/** `2026-10-17` → `17 Oct 2026` (Xero style). */
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatMonth(yyyyMm: string): string {
  const d = new Date(`${yyyyMm}-01T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
