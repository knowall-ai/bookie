import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KrakenError,
  MAX_TRADE_LOOKUPS,
  clearKrakenCache,
  dailyCloseRate,
  krakenPair,
  latestRate,
  nearestTradeRate,
  parseKrakenOhlc,
  parseKrakenTrades,
  ratesForBlockTimes,
  valueFor,
  valueNow,
} from './kraken';

/* Response shapes follow Kraken's public API; the prices are made up for the test. */

const DAY = 86_400;
const D1 = Date.UTC(2026, 9, 10) / 1000; // 10 Oct 2026 00:00 UTC
const D2 = D1 + DAY;
const NOW = D2 + DAY + 3600; // 12 Oct 2026 01:00 UTC
const BLOCK = D1 + 14 * 3600 + 32 * 60 + 10; // 10 Oct 2026 14:32:10 UTC

const ohlc = (key = 'XXBTZGBP') => ({
  error: [],
  result: {
    [key]: [
      [D1, '50000.0', '51000.0', '49000.0', '50500.5', '50200.0', '12.3', 1000],
      [D2, '50500.5', '52000.0', '50000.0', '51234.5', '51000.0', '10.1', 900],
      [D2 + DAY, '51234.5', '51500.0', '51000.0', '51300.0', '51200.0', '1.0', 50],
      ['bad row'],
    ],
    last: D2 + DAY,
  },
});

const trades = (rows: [string, number][], key = 'XXBTZGBP') => ({
  error: [],
  result: {
    [key]: rows.map(([price, time]) => [price, '0.01', time, 'b', 'm', '', 1]),
    last: '1',
  },
});

const UNKNOWN_PAIR = { error: ['EQuery:Unknown asset pair'] };

function fakeFetch(handler: (url: string) => unknown) {
  return vi.fn(async (url: string | URL | Request) =>
    Response.json(handler(String(url)))
  ) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

describe('krakenPair', () => {
  it('builds XBT<currency> for ISO codes', () => {
    expect(krakenPair('GBP')).toBe('XBTGBP');
    expect(krakenPair('usd')).toBe('XBTUSD');
    expect(krakenPair('EUR')).toBe('XBTEUR');
    expect(krakenPair('BTC')).toBeUndefined();
    expect(krakenPair('')).toBeUndefined();
    expect(krakenPair('US$')).toBeUndefined();
  });
});

describe('parsing', () => {
  it('reads OHLC closes and drops bad rows', () => {
    expect(parseKrakenOhlc(ohlc())).toEqual([
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

  it('raises Kraken errors, flagging an unknown pair', () => {
    expect(() => parseKrakenOhlc(UNKNOWN_PAIR)).toThrow(KrakenError);
    try {
      parseKrakenOhlc(UNKNOWN_PAIR);
    } catch (error) {
      expect((error as KrakenError).unknownPair).toBe(true);
    }
    expect(() => parseKrakenOhlc({ error: [], result: {} })).toThrow(/no price data/);
    expect(() => parseKrakenOhlc(null)).toThrow(KrakenError);
  });
});

describe('rates', () => {
  it('takes the trade nearest the block time, either side, labelled with its time', () => {
    const list = parseKrakenTrades(
      trades(
        [
          ['61000.0', BLOCK - 40],
          ['61020.0', BLOCK + 5],
          ['61100.0', BLOCK + 300],
        ],
        'XXBTZUSD'
      )
    );
    const rate = nearestTradeRate(list, BLOCK, 'USD')!;
    expect(rate).toMatchObject({ perBtc: 61020, currency: 'USD', source: 'kraken-trade' });
    expect(rate.label).toBe('Kraken XBTUSD at 14:32 UTC, 10 Oct 2026');
    expect(nearestTradeRate(list, BLOCK + 7 * 3600, 'USD')).toBeUndefined();
  });

  it('labels the daily close as a fallback, closed days only', () => {
    const candles = parseKrakenOhlc(ohlc());
    const rate = dailyCloseRate(candles, D2 + 5 * 3600, NOW, 'GBP')!;
    expect(rate).toMatchObject({ perBtc: 51234.5, source: 'kraken-daily-close' });
    expect(rate.label).toMatch(/^Kraken XBTGBP daily close, 11 Oct 2026 \(fallback/);
    expect(dailyCloseRate(candles, D2 + DAY + 60, NOW, 'GBP')).toBeUndefined();
  });

  it('values satoshis to the cent in the rate’s currency', () => {
    const rate = nearestTradeRate(parseKrakenTrades(trades([['50500.5', BLOCK]])), BLOCK, 'GBP')!;
    expect(valueFor(150_000, rate)).toMatchObject({ ok: true, amount: 75.75, currency: 'GBP' });
    expect(valueFor(-61_000, rate)).toMatchObject({ ok: true, amount: -30.81 });
  });
});

describe('ratesForBlockTimes', () => {
  beforeEach(() => clearKrakenCache());

  it('values each transaction at its own time from Trades, starting just before the block', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url).toContain('Trades?pair=XBTUSD');
      expect(url).toContain(`since=${BLOCK - 900}`);
      return trades(
        [
          ['61000.0', BLOCK - 40],
          ['61020.0', BLOCK + 5],
        ],
        'XXBTZUSD'
      );
    });
    const rates = await ratesForBlockTimes([BLOCK], 'USD', { fetchImpl, nowMs: NOW * 1000 });
    const rate = rates.get(BLOCK) as { perBtc: number; label: string };
    expect(rate.perBtc).toBe(61020);
    expect(rate.label).toBe('Kraken XBTUSD at 14:32 UTC, 10 Oct 2026');
    // Never the daily candles when the exact price is there.
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('OHLC'))).toBe(false);
  });

  it('reads the next page when the first stops short of the block time', async () => {
    const fetchImpl = fakeFetch((url) =>
      url.includes(`since=${BLOCK - 900}`)
        ? trades([['60900.0', BLOCK - 800]])
        : trades([['61030.0', BLOCK + 2]])
    );
    const rates = await ratesForBlockTimes([BLOCK], 'GBP', { fetchImpl, nowMs: NOW * 1000 });
    expect((rates.get(BLOCK) as { perBtc: number }).perBtc).toBe(61030);
  });

  it('falls back to the daily close, labelled, when no trade is near', async () => {
    const fetchImpl = fakeFetch((url) => (url.includes('OHLC') ? ohlc() : trades([])));
    const rates = await ratesForBlockTimes([BLOCK], 'GBP', { fetchImpl, nowMs: NOW * 1000 });
    expect((rates.get(BLOCK) as { label: string }).label).toMatch(/daily close.*fallback/);
  });

  it('gives no value in a currency Kraken does not list, and converts through nothing', async () => {
    const fetchImpl = fakeFetch(() => UNKNOWN_PAIR);
    const rates = await ratesForBlockTimes([BLOCK, BLOCK + 60], 'SVC', {
      fetchImpl,
      nowMs: NOW * 1000,
    });
    expect(rates.get(BLOCK)).toMatch(/Kraken doesn't list XBTSVC/);
    expect(rates.get(BLOCK + 60)).toMatch(/Kraken doesn't list XBTSVC/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives no value when the base currency is unknown', async () => {
    const fetchImpl = fakeFetch(() => ohlc());
    const rates = await ratesForBlockTimes([BLOCK], undefined, { fetchImpl });
    expect(rates.get(BLOCK)).toMatch(/base currency isn't available/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('gives a reason instead of a figure when Kraken is down', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const rates = await ratesForBlockTimes([BLOCK], 'GBP', { fetchImpl, nowMs: NOW * 1000 });
    expect(rates.get(BLOCK)).toBe('Kraken could not be reached.');
  });

  it('limits lookups per call, then uses the labelled fallback or says why', async () => {
    const fetchImpl = fakeFetch((url) =>
      url.includes('OHLC') ? ohlc() : trades([['50000', Number(/since=(\d+)/.exec(url)![1]) + 900]])
    );
    const times = Array.from({ length: MAX_TRADE_LOOKUPS + 3 }, (_, i) => D1 + 3600 + i * 600);
    const rates = await ratesForBlockTimes(times, 'GBP', { fetchImpl, nowMs: NOW * 1000 });
    const values = [...rates.values()] as { source?: string }[];
    expect(values.filter((r) => r.source === 'kraken-trade')).toHaveLength(MAX_TRADE_LOOKUPS);
    expect(values.filter((r) => r.source === 'kraken-daily-close')).toHaveLength(3);
  });
});

describe('balance value', () => {
  beforeEach(() => clearKrakenCache());

  it('values the balance at the latest trade in the base currency', async () => {
    const fetchImpl = fakeFetch(() =>
      trades(
        [
          ['61000.0', NOW - 60],
          ['61010.0', NOW - 5],
        ],
        'XXBTZUSD'
      )
    );
    const rate = await latestRate('USD', fetchImpl, NOW * 1000);
    expect(rate?.perBtc).toBe(61010);
    expect(rate?.label).toBe('Kraken XBTUSD last trade at 00:59 UTC, 12 Oct 2026');
  });

  it('says why there is no value for an unlisted or unknown currency', async () => {
    const fetchImpl = fakeFetch(() => UNKNOWN_PAIR);
    expect(await valueNow(100_000, 'SVC', fetchImpl)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/doesn't convert through another currency/),
    });
    expect(await valueNow(100_000, undefined, fetchImpl)).toMatchObject({ ok: false });
  });
});
