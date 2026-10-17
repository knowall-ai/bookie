/**
 * Base-currency arithmetic for multi-currency books.
 *
 * Bookie never invents an exchange rate: an amount in a foreign currency is
 * only converted with the rate the source system gave for that document
 * (Xero's `CurrencyRate`, units of foreign currency per one base unit). With
 * no rate the base amount is unknown (`undefined`), and totals say how many
 * documents they had to leave out.
 */
import type { DocumentBucket } from './types';

const round = (n: number) => Math.round(n * 100) / 100;

export function isForeign(currency: string | undefined, baseCurrency: string): boolean {
  return !!currency && !!baseCurrency && currency.toUpperCase() !== baseCurrency.toUpperCase();
}

/** `amount` in the base currency, or `undefined` when the source gave no usable rate. */
export function toBaseAmount(
  amount: number,
  currency: string | undefined,
  baseCurrency: string,
  rate: number | undefined
): number | undefined {
  if (!isForeign(currency, baseCurrency)) return amount;
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) return undefined;
  return round(amount / rate);
}

export interface BaseTotal extends DocumentBucket {
  /** Documents left out of `total` (and `count`) because their base amount is unknown. */
  excluded: number;
  /** Their currencies, for the note under the total. */
  excludedCurrencies: string[];
}

/** Sum documents in the base currency, skipping (and counting) ones that can't be converted. */
export function sumInBase<T extends { currency: string; currencyRate?: number }>(
  docs: T[],
  amount: (doc: T) => number | undefined,
  baseCurrency: string
): BaseTotal {
  let total = 0;
  let count = 0;
  let excluded = 0;
  const currencies = new Set<string>();
  for (const doc of docs) {
    const value = amount(doc);
    if (value === undefined) continue;
    const base = toBaseAmount(value, doc.currency, baseCurrency, doc.currencyRate);
    if (base === undefined) {
      excluded += 1;
      currencies.add(doc.currency);
      continue;
    }
    total += base;
    count += 1;
  }
  return { count, total: round(total), excluded, excludedCurrencies: [...currencies].sort() };
}

/** "2 EUR invoices aren't included: Business Central gives no exchange rate for them." */
export function excludedNote(
  excluded: number,
  currencies: string[],
  noun: string,
  source: string
): string | undefined {
  if (excluded === 0) return undefined;
  const which = currencies.length ? `${currencies.join('/')} ` : 'foreign-currency ';
  const plural = excluded === 1 ? noun : `${noun}s`;
  const verb = excluded === 1 ? "isn't" : "aren't";
  return `${excluded} ${which}${plural} ${verb} included in these totals: ${source} gives no exchange rate for ${excluded === 1 ? 'it' : 'them'}.`;
}
