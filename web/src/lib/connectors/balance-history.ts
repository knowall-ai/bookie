/**
 * Balance-over-time for the bank account cards, shared by the connectors.
 *
 * A history is only ever built from the source's own figures: a closing balance
 * the source reports, walked back through the movements the source lists. Nothing
 * is interpolated, and a reconstruction that doesn't tie out to a balance the
 * source reports for the start of the window is thrown away (see `tiesOut`).
 */
import type { BalancePoint, BankBalanceHistories, IsoDate } from '@/lib/domain/types';

/** Days of history on a card, about a month as Xero's dashboard shows. Four whole weeks. */
export const HISTORY_DAYS = 28;

/** How long a tenant's histories are reused: a few minutes keeps Xero's 60 calls a minute safe. */
export const HISTORY_TTL_MS = 5 * 60_000;

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The chart window: the opening point (`from`, closing balance the day before) through `to`. */
export function historyWindow(to: IsoDate, days = HISTORY_DAYS) {
  return { from: addDays(to, -days), to };
}

/** A signed movement on a bank account: positive is money in. */
export interface Movement {
  date: IsoDate;
  amount: number;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * Daily closing balances from `from` to `to` inclusive, given the closing
 * balance at the end of `to` and every movement dated after `from` up to `to`.
 * Walks back a day at a time: the balance at the end of day d-1 is the balance
 * at the end of day d less day d's movements. Sums in whole cents so long
 * windows don't drift. Movements outside (`from`, `to`] are ignored.
 */
export function reconstructDaily(
  closing: number,
  movements: Movement[],
  from: IsoDate,
  to: IsoDate
): BalancePoint[] {
  const net = new Map<IsoDate, number>();
  for (const m of movements) {
    if (m.date > from && m.date <= to) net.set(m.date, (net.get(m.date) ?? 0) + cents(m.amount));
  }
  const points: BalancePoint[] = [];
  let balance = cents(closing);
  for (let date = to; date >= from; date = addDays(date, -1)) {
    points.push({ date, balance: balance / 100 });
    balance -= net.get(date) ?? 0;
  }
  return points.reverse();
}

/** Total of the movements dated after `date` (used to take future-dated postings out of a balance). */
export function movementsAfter(movements: Movement[], date: IsoDate): number {
  return movements.filter((m) => m.date > date).reduce((s, m) => s + cents(m.amount), 0) / 100;
}

/** True when a reconstructed balance matches the one the source reports, to the penny. */
export function tiesOut(reconstructed: number, reported: number): boolean {
  return cents(reconstructed) === cents(reported);
}

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { at: number; value: Promise<BankBalanceHistories> }>();

/**
 * Reuse a tenant's histories for `HISTORY_TTL_MS`. `key` must start with the
 * Entra tenant id from the verified sign-in, then the connection and organisation,
 * so one tenant can never see another's cached figures. A failed read isn't kept.
 */
export function cachedHistories(
  key: string,
  load: () => Promise<BankBalanceHistories>,
  now = Date.now()
): Promise<BankBalanceHistories> {
  const hit = cache.get(key);
  if (hit && now - hit.at < HISTORY_TTL_MS) return hit.value;
  const value = load();
  cache.set(key, { at: now, value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  if (cache.size > 500) {
    for (const [k, v] of cache) if (now - v.at >= HISTORY_TTL_MS) cache.delete(k);
  }
  return value;
}

export function clearHistoryCache() {
  cache.clear();
}
