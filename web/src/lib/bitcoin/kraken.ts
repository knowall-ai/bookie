/**
 * Values for Bitcoin amounts in the organisation's base currency, from Kraken's public
 * market data only: the pair XBT<currency> (XBTGBP, XBTUSD, XBTEUR, or any other that
 * Kraken lists). A currency Kraken doesn't quote has no value: Bookie never converts
 * through another currency at a rate it made up.
 *
 * - A confirmed transaction is valued at its own time: the Kraken trade nearest the
 *   second its block was mined (`Trades?since=`, Kraken's full trade history), labelled
 *   "Kraken XBTUSD at 14:32 UTC, 10 Oct 2026". Payments are worked out in sats at the
 *   moment of payment, so the price at that moment is the one that matters.
 * - Only when that lookup isn't possible (Kraken's rate limit, or no trade within six
 *   hours) the daily close of the block's UTC day (`OHLC?interval=1440`, about the last
 *   720 days, closed days only), labelled as a fallback.
 * - The balance is valued at Kraken's latest trade, with its time.
 *
 * Every value carries its source and rate time. Where Kraken can't give a rate the
 * value is undefined with the reason: Bookie never uses today's price for an old
 * amount, and never prices a pending transaction (Electrum gives no first-seen time).
 * Values are for display only: reconciliation matches satoshis and txids, never these.
 * Market prices are public data, not anyone's books, so they are cached in memory.
 */

const KRAKEN = 'https://api.kraken.com/0/public';
const DAY = 86_400;
/** How far from the block time a Kraken trade may be and still price it. */
export const MAX_TRADE_GAP_SECONDS = 6 * 3600;
/** The trade lookup starts this long before the block time, to find the nearest trade either side. */
const LOOKBACK_SECONDS = 15 * 60;

/** Kraken's pair for BTC in `currency` (ISO 4217), e.g. XBTUSD; undefined for a malformed code. */
export function krakenPair(currency: string): string | undefined {
  const code = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) && code !== 'BTC' && code !== 'XBT' ? `XBT${code}` : undefined;
}

export interface FiatRate {
  /** Units of `currency` per 1 BTC. */
  perBtc: number;
  /** ISO currency the rate is in. */
  currency: string;
  source: 'kraken-daily-close' | 'kraken-trade' | 'demo';
  /** When the rate applies (ISO): the close time, or the trade time. */
  rateTime: string;
  /** "Kraken XBTUSD daily close, 17 Oct 2026" */
  label: string;
}

export type FiatValue =
  { ok: true; amount: number; currency: string; rate: FiatRate } | { ok: false; reason: string };

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
  constructor(
    message: string,
    /** Kraken doesn't list this pair at all. */
    readonly unknownPair = false
  ) {
    super(message);
    this.name = 'KrakenError';
  }
}

interface KrakenEnvelope {
  error?: string[];
  result?: Record<string, unknown>;
}

/** The pair's rows in a Kraken result (`XXBTZUSD`), ignoring `last`. */
function pairRows(json: unknown): unknown[] {
  const body = json as KrakenEnvelope;
  if (!body || typeof body !== 'object')
    throw new KrakenError('Kraken sent an unreadable response.');
  if (body.error && body.error.length > 0) {
    const unknown = body.error.some((e) => /Unknown asset pair/i.test(e));
    throw new KrakenError(`Kraken: ${body.error.join(', ')}`, unknown);
  }
  const entry = Object.entries(body.result ?? {}).find(([key]) => key !== 'last');
  if (!entry || !Array.isArray(entry[1])) throw new KrakenError('Kraken returned no price data.');
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

/** "14:32 UTC, 10 Oct 2026" */
const timeLabel = (unix: number) =>
  `${new Date(unix * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })} UTC, ${dateLabel(unix)}`;

/**
 * The closed daily candle covering `blockTime`, as a fallback rate (labelled so), or
 * undefined. Only used when the trade at the block time can't be looked up.
 */
export function dailyCloseRate(
  candles: Candle[],
  blockTime: number,
  now: number,
  currency: string,
  /** A fallback for a transaction's own-time price (labelled so), or a daily figure in its own right. */
  use: 'fallback' | 'daily' = 'fallback'
): FiatRate | undefined {
  const dayStart = blockTime - (blockTime % DAY);
  const candle = candles.find((c) => c.time === dayStart);
  // Today's candle is still open: its "close" is just the latest trade.
  if (!candle || candle.time + DAY > now) return undefined;
  return {
    perBtc: candle.close,
    currency,
    source: 'kraken-daily-close',
    rateTime: new Date((candle.time + DAY) * 1000).toISOString(),
    label: `Kraken ${krakenPair(currency)} daily close, ${dateLabel(candle.time)}${use === 'fallback' ? " (fallback: the price at the block time wasn't available)" : ''}`,
  };
}

const tradeRateOf = (trade: Trade, currency: string, label: string): FiatRate => ({
  perBtc: trade.price,
  currency,
  source: 'kraken-trade',
  rateTime: new Date(Math.floor(trade.time * 1000)).toISOString(),
  label,
});

/** The trade nearest `at` (either side), within the allowed gap: "Kraken XBTUSD at 14:32 UTC, 10 Oct 2026". */
export function nearestTradeRate(
  trades: Trade[],
  at: number,
  currency: string
): FiatRate | undefined {
  let best: Trade | undefined;
  for (const t of trades) {
    if (!best || Math.abs(t.time - at) < Math.abs(best.time - at)) best = t;
  }
  if (!best || Math.abs(best.time - at) > MAX_TRADE_GAP_SECONDS) return undefined;
  return tradeRateOf(best, currency, `Kraken ${krakenPair(currency)} at ${timeLabel(best.time)}`);
}

export function latestTradeRate(trades: Trade[], currency: string): FiatRate | undefined {
  const trade = trades.at(-1);
  if (!trade) return undefined;
  return tradeRateOf(
    trade,
    currency,
    `Kraken ${krakenPair(currency)} last trade at ${timeLabel(trade.time)}`
  );
}

const roundCents = (x: number) => (Math.sign(x) * Math.round(Math.abs(x) * 100)) / 100;

/** sats × rate, to the cent (2 decimals). */
export function valueFor(sats: number, rate: FiatRate): FiatValue {
  return {
    ok: true,
    // Symmetric to the cent: -0.125 rounds to -0.13, as 0.125 rounds to 0.13.
    amount: roundCents((sats / 1e8) * rate.perBtc),
    currency: rate.currency,
    rate,
  };
}

/** Why there's no value at all in this currency (no pair, or no currency). */
export function noPairReason(currency: string | undefined): string | undefined {
  if (!currency) return "The organisation's base currency isn't available, so there is no value.";
  if (!krakenPair(currency)) return `There is no Kraken price for BTC in ${currency}.`;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Fetching (cached per pair: public market data, not tenant data)     */
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

const unknownPairReason = (currency: string) =>
  `Kraken doesn't list ${krakenPair(currency)}, so there is no BTC price in ${currency}. Bookie doesn't convert through another currency.`;

const OHLC_TTL_MS = 10 * 60_000;
const LATEST_TTL_MS = 60_000;
/** Trade lookups per pricing call; Kraken's public API allows about one call a second. */
export const MAX_TRADE_LOOKUPS = 12;

const ohlcCache = new Map<string, { at: number; value: Promise<Candle[]> }>();
const latestCache = new Map<string, { at: number; value: Promise<FiatRate | undefined> }>();
const tradeCache = new Map<string, FiatRate | null>();

/** Forget cached prices (tests). */
export function clearKrakenCache() {
  ohlcCache.clear();
  latestCache.clear();
  tradeCache.clear();
}

function cached<T>(
  map: Map<string, { at: number; value: Promise<T> }>,
  key: string,
  ttl: number,
  nowMs: number,
  load: () => Promise<T>
): Promise<T> {
  const hit = map.get(key);
  if (hit && nowMs - hit.at < ttl) return hit.value;
  const value = load();
  map.set(key, { at: nowMs, value });
  value.catch(() => {
    if (map.get(key)?.value === value) map.delete(key);
  });
  return value;
}

/** Kraken's latest BTC trade in `currency`, for valuing a balance now. */
export async function latestRate(
  currency: string,
  fetchImpl: Fetch = fetch,
  nowMs = Date.now()
): Promise<FiatRate | undefined> {
  const pair = krakenPair(currency);
  if (!pair) return undefined;
  return cached(latestCache, pair, LATEST_TTL_MS, nowMs, () =>
    krakenJson(fetchImpl, `Trades?pair=${pair}`).then((json) =>
      latestTradeRate(parseKrakenTrades(json), currency.toUpperCase())
    )
  );
}

/** The balance's value at Kraken's latest trade, or the reason there isn't one. */
export async function valueNow(
  sats: number,
  currency: string | undefined,
  fetchImpl: Fetch = fetch
): Promise<FiatValue> {
  const missing = noPairReason(currency);
  if (missing) return { ok: false, reason: missing };
  try {
    const rate = await latestRate(currency!, fetchImpl);
    return rate
      ? valueFor(sats, rate)
      : { ok: false, reason: `Kraken returned no recent ${krakenPair(currency!)} trade.` };
  } catch (error) {
    if (error instanceof KrakenError && error.unknownPair) {
      return { ok: false, reason: unknownPairReason(currency!.toUpperCase()) };
    }
    return { ok: false, reason: (error as Error).message || 'Kraken prices are unavailable.' };
  }
}

/**
 * Rates for a set of block times (one page of transactions) in `currency`. Keys are
 * the block times; a missing rate comes back as the reason instead.
 */
export async function ratesForBlockTimes(
  blockTimes: number[],
  currency: string | undefined,
  options: { fetchImpl?: Fetch; nowMs?: number } = {}
): Promise<Map<number, FiatRate | string>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = options.nowMs ?? Date.now();
  const now = Math.floor(nowMs / 1000);
  const out = new Map<number, FiatRate | string>();
  const unique = [...new Set(blockTimes)].sort((a, b) => b - a);
  if (unique.length === 0) return out;
  const missing = noPairReason(currency);
  if (missing) {
    for (const time of unique) out.set(time, missing);
    return out;
  }
  const code = currency!.trim().toUpperCase();
  const pair = krakenPair(code)!;
  const noTrade = `Kraken has no ${pair} trade within six hours of the block time.`;

  // Daily candles, fetched only if a fallback is needed.
  let candles: Promise<Candle[] | string> | undefined;
  const fallback = async (time: number, why: string): Promise<FiatRate | string> => {
    candles ??= cached(ohlcCache, pair, OHLC_TTL_MS, nowMs, () =>
      krakenJson(fetchImpl, `OHLC?pair=${pair}&interval=1440`).then(parseKrakenOhlc)
    ).catch((error: unknown) =>
      error instanceof KrakenError && error.unknownPair
        ? unknownPairReason(code)
        : error instanceof KrakenError
          ? error.message
          : 'Kraken prices are unavailable.'
    );
    const list = await candles;
    if (typeof list === 'string') return list;
    return dailyCloseRate(list, time, now, code) ?? why;
  };

  let lookups = 0;
  for (const time of unique) {
    const key = `${pair}:${time}`;
    const hit = tradeCache.get(key);
    if (hit) {
      out.set(time, hit);
      continue;
    }
    if (hit === null) {
      out.set(time, await fallback(time, noTrade));
      continue;
    }
    if (lookups >= MAX_TRADE_LOOKUPS) {
      out.set(
        time,
        await fallback(
          time,
          'Not looked up yet: Kraken limits how fast Bookie may ask. Reload in a minute.'
        )
      );
      continue;
    }
    try {
      // The trades from just before the block time; if they stop short of it, the next page.
      lookups++;
      const trades = parseKrakenTrades(
        await krakenJson(fetchImpl, `Trades?pair=${pair}&since=${time - LOOKBACK_SECONDS}`)
      );
      if (!trades.some((t) => t.time >= time) && lookups < MAX_TRADE_LOOKUPS) {
        lookups++;
        trades.push(
          ...parseKrakenTrades(await krakenJson(fetchImpl, `Trades?pair=${pair}&since=${time}`))
        );
      }
      const rate = nearestTradeRate(trades, time, code);
      // Only remember a miss once enough time has passed for a trade to have happened.
      if (rate || now - time > MAX_TRADE_GAP_SECONDS) tradeCache.set(key, rate ?? null);
      if (tradeCache.size > 5_000) tradeCache.clear();
      out.set(time, rate ?? (await fallback(time, noTrade)));
    } catch (error) {
      if (error instanceof KrakenError && error.unknownPair) {
        for (const t of unique) out.set(t, unknownPairReason(code));
        return out;
      }
      out.set(
        time,
        await fallback(
          time,
          error instanceof KrakenError ? error.message : 'Kraken prices are unavailable.'
        )
      );
    }
  }
  return out;
}

/**
 * One rate per UTC day (`YYYY-MM-DD`) for a balance chart: Kraken's daily close for a
 * closed day, Kraken's latest trade for today. A day Kraken has no close for (older
 * than its daily history) is missing. Returns the reason instead when there's no price
 * in this currency at all.
 */
export async function ratesForDays(
  days: string[],
  currency: string | undefined,
  options: { fetchImpl?: Fetch; nowMs?: number } = {}
): Promise<Map<string, FiatRate> | string> {
  const missing = noPairReason(currency);
  if (missing) return missing;
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowMs = options.nowMs ?? Date.now();
  const now = Math.floor(nowMs / 1000);
  const code = currency!.trim().toUpperCase();
  const pair = krakenPair(code)!;
  try {
    const candles = await cached(ohlcCache, pair, OHLC_TTL_MS, nowMs, () =>
      krakenJson(fetchImpl, `OHLC?pair=${pair}&interval=1440`).then(parseKrakenOhlc)
    );
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const out = new Map<string, FiatRate>();
    for (const day of days) {
      const start = Date.parse(`${day}T00:00:00Z`) / 1000;
      const rate =
        day === today
          ? await latestRate(code, fetchImpl, nowMs)
          : dailyCloseRate(candles, start, now, code, 'daily');
      if (rate) out.set(day, rate);
    }
    return out;
  } catch (error) {
    if (error instanceof KrakenError && error.unknownPair) return unknownPairReason(code);
    return error instanceof KrakenError ? error.message : 'Kraken prices are unavailable.';
  }
}
