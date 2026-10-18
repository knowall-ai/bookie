import { afterEach, describe, expect, it } from 'vitest';
import {
  addDays,
  cachedHistories,
  clearHistoryCache,
  HISTORY_DAYS,
  HISTORY_TTL_MS,
  historyWindow,
  movementsAfter,
  reconstructDaily,
  tiesOut,
} from './balance-history';
import type { BankBalanceHistories } from '@/lib/domain/types';

describe('balance history maths', () => {
  it('spans four whole weeks ending today', () => {
    expect(HISTORY_DAYS).toBe(28);
    expect(historyWindow('2026-10-18')).toEqual({ from: '2026-09-20', to: '2026-10-18' });
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('walks back from the closing balance through each day’s movements', () => {
    const points = reconstructDaily(
      1000,
      [
        { date: '2026-10-03', amount: 250 },
        { date: '2026-10-03', amount: -50 },
        { date: '2026-10-05', amount: -100 },
      ],
      '2026-10-01',
      '2026-10-05'
    );
    expect(points).toEqual([
      { date: '2026-10-01', balance: 900 },
      { date: '2026-10-02', balance: 900 },
      { date: '2026-10-03', balance: 1100 },
      { date: '2026-10-04', balance: 1100 },
      { date: '2026-10-05', balance: 1000 },
    ]);
  });

  it('ignores movements on the opening day or after the closing day', () => {
    const points = reconstructDaily(
      500,
      [
        { date: '2026-10-01', amount: 999 },
        { date: '2026-10-09', amount: 999 },
      ],
      '2026-10-01',
      '2026-10-02'
    );
    expect(points.map((p) => p.balance)).toEqual([500, 500]);
  });

  it('sums in whole cents, so long windows never drift', () => {
    const movements = Array.from({ length: 28 }, (_, i) => ({
      date: addDays('2026-09-20', i + 1),
      amount: 0.1,
    }));
    const points = reconstructDaily(102.8, movements, '2026-09-20', '2026-10-18');
    expect(points[0]).toEqual({ date: '2026-09-20', balance: 100 });
    expect(points).toHaveLength(29);
  });

  it('totals future-dated movements and ties out to the penny', () => {
    const movements = [
      { date: '2026-10-17', amount: 10 },
      { date: '2026-10-20', amount: 0.1 },
      { date: '2026-11-01', amount: 0.2 },
    ];
    expect(movementsAfter(movements, '2026-10-18')).toBe(0.3);
    expect(tiesOut(0.1 + 0.2, 0.3)).toBe(true);
    expect(tiesOut(100, 100.01)).toBe(false);
  });
});

describe('history cache', () => {
  afterEach(clearHistoryCache);
  const result = (n: number): BankBalanceHistories => ({ readAt: `t${n}`, accounts: {} });

  it('reuses a read for a few minutes, per key', async () => {
    let reads = 0;
    const load = async () => result(++reads);
    expect((await cachedHistories('tenant-a:conn:org', load, 0)).readAt).toBe('t1');
    expect((await cachedHistories('tenant-a:conn:org', load, HISTORY_TTL_MS - 1)).readAt).toBe(
      't1'
    );
    // Another tenant never sees the first tenant's figures.
    expect((await cachedHistories('tenant-b:conn:org', load, 1)).readAt).toBe('t2');
    expect((await cachedHistories('tenant-a:conn:org', load, HISTORY_TTL_MS)).readAt).toBe('t3');
  });

  it("doesn't keep a failed read", async () => {
    await expect(
      cachedHistories('k', () => Promise.reject(new Error('Xero is down')), 0)
    ).rejects.toThrow();
    await Promise.resolve();
    expect((await cachedHistories('k', async () => result(1), 1)).readAt).toBe('t1');
  });
});
