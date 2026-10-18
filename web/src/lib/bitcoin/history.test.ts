import { describe, expect, it } from 'vitest';
import { dailyBalances } from './history';

const at = (iso: string) => Date.parse(iso) / 1000;

describe('dailyBalances', () => {
  it('works back from the confirmed balance, by UTC day, leaving pending out', () => {
    const points = dailyBalances(
      150_000,
      [
        { blockTime: at('2026-10-15T10:00:00Z'), netSats: 100_000, pending: false },
        { blockTime: at('2026-10-17T09:00:00Z'), netSats: 50_000, pending: false },
        { netSats: 999_999, pending: true },
      ],
      4,
      new Date('2026-10-17T12:00:00Z')
    );
    expect(points).toEqual([
      { date: '2026-10-14', sats: 0 },
      { date: '2026-10-15', sats: 100_000 },
      { date: '2026-10-16', sats: 100_000 },
      { date: '2026-10-17', sats: 150_000 },
    ]);
  });

  it('includes a payment out on its own day', () => {
    const points = dailyBalances(
      40_000,
      [
        { blockTime: at('2026-10-16T08:00:00Z'), netSats: 100_000, pending: false },
        { blockTime: at('2026-10-16T20:00:00Z'), netSats: -60_000, pending: false },
      ],
      2,
      new Date('2026-10-17T00:30:00Z')
    );
    expect(points).toEqual([
      { date: '2026-10-16', sats: 40_000 },
      { date: '2026-10-17', sats: 40_000 },
    ]);
  });
});
