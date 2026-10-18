/**
 * A wallet's balance over time, exact from its chain history: the confirmed balance at
 * the end of each UTC day, worked back from today's confirmed balance by removing the
 * confirmed transactions mined after that day. Pending transactions are in no day.
 */
import type { IsoDate } from '@/lib/domain/types';
import type { ChainTransaction } from './scan';

export interface BalancePoint {
  /** UTC day. */
  date: IsoDate;
  /** Confirmed balance at the end of that day (now, for today). */
  sats: number;
}

const DAY_MS = 86_400_000;

export const isoDay = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);

export function dailyBalances(
  confirmedSats: number,
  transactions: Pick<ChainTransaction, 'blockTime' | 'netSats' | 'pending'>[],
  days: number,
  now: Date = new Date()
): BalancePoint[] {
  const confirmed = transactions
    .filter((t) => !t.pending && t.blockTime !== undefined)
    .map((t) => ({ ms: t.blockTime! * 1000, sats: t.netSats }));
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const points: BalancePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = todayStart - i * DAY_MS;
    const dayEnd = Math.min(dayStart + DAY_MS, now.getTime() + 1);
    // Everything mined at or after the end of this day hadn't happened yet.
    const later = confirmed.reduce((s, t) => s + (t.ms >= dayEnd ? t.sats : 0), 0);
    points.push({ date: isoDay(dayStart), sats: confirmedSats - later });
  }
  return points;
}
