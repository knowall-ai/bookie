/**
 * GBP values for Bitcoin amounts, from Kraken's public market data only (XBTGBP).
 *
 * - A confirmed transaction is valued at the Kraken daily close of the UTC day its
 *   block was mined (`OHLC?interval=1440`, about the last 720 days), and only once
 *   that day has closed.
 * - Otherwise (older than the OHLC window, or today) at the first Kraken trade at or
 *   after the block time (`Trades?since=`), if one happened within six hours.
 * - The balance is valued at Kraken's latest trade.
 *
 * Every value carries its source and rate time. Where Kraken can't give a rate the
 * value is undefined with the reason: Bookie never uses today's price for an old
 * amount, and never prices a pending transaction (it has no block time yet).
 * Market prices are public data, not anyone's books, so they are cached in memory.
 */

export const KRAKEN_PAIR = 'XBTGBP';
const KRAKEN = 'https://api.kraken.com/0/public';
const DAY = 86_400;
/** How far after the block time a Kraken trade may be and still price it. */
export const MAX_TRADE_GAP_SECONDS = 6 * 3600;

export interface GbpRate {
  /** GBP per 1 BTC. */
  gbpPerBtc: number;
  source: 'kraken-daily-close' | 'kraken-trade' | 'demo';
  /** When the rate applies (ISO): the close time, or the trade time. */
  rateTime: string;
  /** "Kraken XBTGBP daily close, 17 Oct 2026" */
  label: string;
}

export type GbpValue = { ok: true; gbp: number; rate: GbpRate } | { ok: false; reason: string };

export interface Candle {
  /** Start of the UTC day, unix seconds. */
  time: number;
  close: number;
}

export interface Trade {
  price: number;
  /** Unix seconds (fractional). */
  time: number;
}

export class KrakenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KrakenError';
  }
}

interface KrakenEnvelope {
  error?: string[];
  result?: Record<string, unknown>;
}

/** The pair's rows in a Kraken result (`XXBTZGBP`), ignoring `last`. */
function pairRows(json: unknown): unknown[] {
  const body = json as KrakenEnvelope;
  if (!body || typeof body !== 'object')
    throw new KrakenError('Kraken sent an unreadable response.');
  if (body.error && body.error.length > 0)
    throw new KrakenError(`Kraken: ${body.error.join(', ')}`);
  const entry = Object.entries(body.result ?? {}).find(([key]) => key !== 'last');
  if (!entry || !Array.isArray(entry[1])) throw new KrakenError('Kraken returned no XBTGBP data.');
  return entry[1];
}

function positive(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** `OHLC` rows: [time, open, high, low, close, vwap, volume, count]. Bad rows are dropped. */
export function parseKrakenOhlc(json: unknown): Candle[] {
  return pairRows(json)
    .map((row) => {
      if (!Array.isArray(row)) return undefined;
      const time = Number(row[0]);
      const close = positive(row[4]);
      return Number.isInteger(time) && close ? { time, close } : undefined;
    })
    .filter((c): c is Candle => !!c)
    .sort((a, b) => a.time - b.time);
}

/** `Trades` rows: [price, volume, time, side, type, misc, tradeId]. */
export function parseKrakenTrades(json: unknown): Trade[] {
  return pairRows(json)
    .map((row) => {
      if (!Array.isArray(row)) return undefined;
      const price = positive(row[0]);
      const time = Number(row[2]);
      return price && Number.isFinite(time) ? { price, time } : undefined;
    })
    .filter((t): t is Trade => !!t)
    .sort((a, b) => a.time - b.time);
}

const dateLabel = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const timeLabel = (unix: number) =>
  `${new Date(unix * 1000).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })} UTC`;

/** The closed daily candle covering `blockTime`, as a rate, or undefined. */
export function dailyCloseRate(
  candles: Candle[],
  blockTime: number,
  now: number
): GbpRate | undefined {
  const dayStart = blockTime - (blockTime % DAY);
  const candle = candles.find((c) => c.time === dayStart);
  // Today's candle is still open: its "close" is just the latest trade.
  if (!candle || candle.time + DAY > now) return undefined;
  return {
    gbpPerBtc: candle.close,
    source: 'kraken-daily-close',
    rateTime: new Date((candle.time + DAY) * 1000).toISOString(),
    label: `Kraken ${KRAKEN_PAIR} daily close, ${dateLabel(candle.time)}`,
  };
}

/** The first trade at or after `blockTime`, within the allowed gap. */
export function tradeRate(trades: Trade[], blockTime: number): GbpRate | undefined {
  const trade = trades.find((t) => t.time >= blockTime);
  if (!trade || trade.time - blockTime > MAX_TRADE_GAP_SECONDS) return undefined;
  return {
    gbpPerBtc: trade.price,
    source: 'kraken-trade',
    rateTime: new Date(Math.floor(trade.time * 1000)).toISOString(),
    label: `Kraken ${KRAKEN_PAIR} trade, ${timeLabel(trade.time)}`,
  };
}

export function latestTradeRate(trades: Trade[]): GbpRate | undefined {
  const trade = trades.at(-1);
  if (!trade) return undefined;
  return {
    gbpPerBtc: trade.price,
    source: 'kraken-trade',
    rateTime: new Date(Math.floor(trade.time * 1000)).toISOString(),
    label: `Kraken ${KRAKEN_PAIR} last trade, ${timeLabel(trade.time)}`,
  };
}

/** sats × rate, to the penny. */
export function gbpFor(sats: number, rate: GbpRate): GbpValue {
  return { ok: true, gbp: Math.round((sats / 1e8) * rate.gbpPerBtc * 100) / 100, rate };
}

/* ------------------------------------------------------------------ */
/* Fetching (cached: public market data, not tenant data)              */
/* ------------------------------------------------------------------ */

type Fetch = typeof fetch;

async function krakenJson(fetchImpl: Fetch, path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(`${KRAKEN}/${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new KrakenError('Kraken could not be reached.');
  }
  if (!response.ok) throw new KrakenError(`Kraken returned ${response.status}.`);
  return response.json();
}

const OHLC_TTL_MS = 10 * 60_000;
const LATEST_TTL_MS = 60_000;
/** Trade lookups per pricing call; Kraken's public API allows about one call a second. */
export const MAX_TRADE_LOOKUPS = 8;

let ohlcCache: { at: number; value: Promise<Candle[]> } | undefined;
let latestCache: { at: number; value: Promise<GbpRate | undefined> } | undefined;
const tradeCache = new Map<number, GbpRate | null>();

/** Forget cached prices (tests). */
export function clearKrakenCache() {
  ohlcCache = undefined;
  latestCache = undefined;
  tradeCache.clear();
}

function dailyCandles(fetchImpl: Fetch, nowMs: number): Promise<Candle[]> {
  if (ohlcCache && nowMs - ohlcCache.at < OHLC_TTL_MS) return ohlcCache.value;
  const value = krakenJson(fetchImpl, `OHLC?pair=${KRAKEN_PAIR}&interval=1440`).then(
    parseKrakenOhlc
  );
  ohlcCache = { at: nowMs, value };
  value.catch(() => {
    if (ohlcCache?.value === value) ohlcCache = undefined;
  });
  return value;
}

/** Kraken's latest XBTGBP trade, for valuing a balance now. */
export async function latestRate(
  fetchImpl: Fetch = fetch,
  nowMs = Date.now()
): Promise<GbpRate | undefined> {
  if (latestCache && nowMs - latestCache.at < LATEST_TTL_MS) return latestCache.value;
  const value = krakenJson(fetchImpl, `Trades?pair=${KRAKEN_PAIR}`).then((json) =>
    latestTradeRate(parseKrakenTrades(json))
  );
  latestCache = { at: nowMs, value };
  value.catch(() => {
    if (latestCache?.value === value) latestCache = undefined;
  });
  return value;
}

/**
 * Rates for a set of block times (one page of transactions). Keys are the block
 * times; a missing key comes back with a reason instead of a value.
 */
export async function ratesForBlockTimes(
  blockTimes: number[],
  options: { fetchImpl?: Fetch; nowMs?: number } = {}
): Promise<Map<number, GbpRate | string>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = options.nowMs ?? Date.now();
  const now = Math.floor(nowMs / 1000);
  const out = new Map<number, GbpRate | string>();
  const unique = [...new Set(blockTimes)].sort((a, b) => b - a);
  if (unique.length === 0) return out;

  let candles: Candle[] = [];
  let ohlcError: string | undefined;
  try {
    candles = await dailyCandles(fetchImpl, nowMs);
  } catch (error) {
    ohlcError = error instanceof KrakenError ? error.message : 'Kraken prices are unavailable.';
  }

  let lookups = 0;
  for (const time of unique) {
    const close = dailyCloseRate(candles, time, now);
    if (close) {
      out.set(time, close);
      continue;
    }
    const cached = tradeCache.get(time);
    if (cached !== undefined) {
      out.set(time, cached ?? 'Kraken has no XBTGBP trade within six hours of the block time.');
      continue;
    }
    if (lookups >= MAX_TRADE_LOOKUPS) {
      out.set(
        time,
        'Not looked up yet: Kraken limits how fast Bookie may ask. Reload in a minute.'
      );
      continue;
    }
    lookups++;
    try {
      const trades = parseKrakenTrades(
        await krakenJson(fetchImpl, `Trades?pair=${KRAKEN_PAIR}&since=${time}`)
      );
      const rate = tradeRate(trades, time);
      // Only remember a miss once enough time has passed for a trade to have happened.
      if (rate || now - time > MAX_TRADE_GAP_SECONDS) tradeCache.set(time, rate ?? null);
      if (tradeCache.size > 5_000) tradeCache.clear();
      out.set(time, rate ?? 'Kraken has no XBTGBP trade within six hours of the block time.');
    } catch (error) {
      out.set(
        time,
        ohlcError ??
          (error instanceof KrakenError ? error.message : 'Kraken prices are unavailable.')
      );
    }
  }
  return out;
}
