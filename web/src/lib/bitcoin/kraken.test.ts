import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KrakenError,
  MAX_TRADE_LOOKUPS,
  clearKrakenCache,
  dailyCloseRate,
  gbpFor,
  latestRate,
  parseKrakenOhlc,
  parseKrakenTrades,
  ratesForBlockTimes,
  tradeRate,
} from './kraken';

/* Response shapes follow Kraken's public API; the prices are made up for the test. */

const DAY = 86_400;
const D1 = Date.UTC(2026, 9, 10) / 1000; // 10 Oct 2026 00:00 UTC
const D2 = D1 + DAY;
const NOW = D2 + DAY + 3600; // 12 Oct 2026 01:00 UTC

const ohlc = {
  error: [],
  result: {
    XXBTZGBP: [
      [D1, '50000.0', '51000.0', '49000.0', '50500.5', '50200.0', '12.3', 1000],
      [D2, '50500.5', '52000.0', '50000.0', '51234.5', '51000.0', '10.1', 900],
      [D2 + DAY, '51234.5', '51500.0', '51000.0', '51300.0', '51200.0', '1.0', 50],
      ['bad row'],
    ],
    last: D2 + DAY,
  },
};

const trades = (rows: [string, number][]) => ({
  error: [],
  result: {
    XXBTZGBP: rows.map(([price, time]) => [price, '0.01', time, 'b', 'm', '', 1]),
    last: '1',
  },
});

describe('parsing', () => {
  it('reads OHLC closes and drops bad rows', () => {
    expect(parseKrakenOhlc(ohlc)).toEqual([
      { time: D1, close: 50500.5 },
      { time: D2, close: 51234.5 },
      { time: D2 + DAY, close: 51300 },
    ]);
  });

  it('reads trades', () => {
    expect(parseKrakenTrades(trades([['50000.1', D1 + 10.5]]))).toEqual([
      { price: 50000.1, time: D1 + 10.5 },
    ]);
  });

  it('raises Kraken errors', () => {
    expect(() => parseKrakenOhlc({ error: ['EQuery:Unknown asset pair'] })).toThrow(KrakenError);
    expect(() => parseKrakenOhlc({ error: [], result: {} })).toThrow(/no XBTGBP/);
    expect(() => parseKrakenOhlc(null)).toThrow(KrakenError);
  });
});

describe('rates', () => {
  const candles = parseKrakenOhlc(ohlc);

  it('uses the daily close of the block day, labelled with source and close time', () => {
    const rate = dailyCloseRate(candles, D2 + 5 * 3600, NOW)!;
    expect(rate.gbpPerBtc).toBe(51234.5);
    expect(rate.source).toBe('kraken-daily-close');
    expect(rate.rateTime).toBe('2026-10-12T00:00:00.000Z');
    expect(rate.label).toBe('Kraken XBTGBP daily close, 11 Oct 2026');
  });

  it("never uses today's open candle as a close", () => {
    expect(dailyCloseRate(candles, D2 + DAY + 60, NOW)).toBeUndefined();
  });

  it('has no close outside the window', () => {
    expect(dailyCloseRate(candles, D1 - 100, NOW)).toBeUndefined();
  });

  it('uses the first trade at or after the block time, within six hours', () => {
    const list = parseKrakenTrades(
      trades([
        ['1.0', D1 - 5],
        ['50100.0', D1 + 120],
        ['50200.0', D1 + 240],
      ])
    );
    const rate = tradeRate(list, D1 + 100)!;
    expect(rate.gbpPerBtc).toBe(50100);
    expect(rate.label).toBe('Kraken XBTGBP trade, 10 Oct 2026, 00:02 UTC');
    expect(tradeRate(list, D1 + 300)).toBeUndefined();
    expect(tradeRate(parseKrakenTrades(trades([['5', D1 + 7 * 3600]])), D1)).toBeUndefined();
  });

  it('values satoshis to the penny', () => {
    const rate = dailyCloseRate(candles, D1 + 1, NOW)!;
    expect(gbpFor(150_000, rate)).toMatchObject({ ok: true, gbp: 75.75 });
    expect(gbpFor(-61_000, rate)).toMatchObject({ ok: true, gbp: -30.81 });
  });
});

describe('ratesForBlockTimes', () => {
  beforeEach(() => clearKrakenCache());

  function fakeFetch(handler: (url: string) => unknown) {
    return vi.fn(async (url: string | URL | Request) =>
      Response.json(handler(String(url)))
    ) as unknown as typeof fetch;
  }

  it('prices from the daily close and falls back to trades for today', async () => {
    const fetchImpl = fakeFetch((url) =>
      url.includes('OHLC') ? ohlc : trades([['51299.0', D2 + DAY + 100]])
    );
    const rates = await ratesForBlockTimes([D1 + 10, D2 + DAY + 50], {
      fetchImpl,
      nowMs: NOW * 1000,
    });
    expect((rates.get(D1 + 10) as { source: string }).source).toBe('kraken-daily-close');
    expect((rates.get(D2 + DAY + 50) as { gbpPerBtc: number }).gbpPerBtc).toBe(51299);
  });

  it('gives a reason instead of a figure when Kraken is down', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const rates = await ratesForBlockTimes([D1 + 10], { fetchImpl, nowMs: NOW * 1000 });
    expect(rates.get(D1 + 10)).toBe('Kraken could not be reached.');
  });

  it('limits trade lookups per call', async () => {
    const fetchImpl = fakeFetch((url) => (url.includes('OHLC') ? ohlc : trades([])));
    const old = Array.from({ length: MAX_TRADE_LOOKUPS + 3 }, (_, i) => D1 - (i + 2) * DAY);
    const rates = await ratesForBlockTimes(old, { fetchImpl, nowMs: NOW * 1000 });
    const reasons = [...rates.values()].filter((r) => typeof r === 'string') as string[];
    expect(reasons.filter((r) => r.startsWith('Not looked up yet'))).toHaveLength(3);
    expect(reasons.filter((r) => r.includes('no XBTGBP trade'))).toHaveLength(MAX_TRADE_LOOKUPS);
  });

  it('values the balance at the latest trade', async () => {
    const fetchImpl = fakeFetch(() =>
      trades([
        ['51000.0', NOW - 60],
        ['51010.0', NOW - 5],
      ])
    );
    const rate = await latestRate(fetchImpl, NOW * 1000);
    expect(rate?.gbpPerBtc).toBe(51010);
    expect(rate?.label).toMatch(/^Kraken XBTGBP last trade, 12 Oct 2026, 00:59 UTC$/);
  });
});
