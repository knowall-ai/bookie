/**
 * Base-currency arithmetic for multi-currency books.
 *
 * Bookie never invents an exchange rate: an amount in a foreign currency is
 * only converted with the rate the source system gave for that document
 * (Xero's `CurrencyRate`, units of foreign currency per one base unit). With
 * no rate the base amount is unknown (`undefined`). Only for one document (its
 * "Total in <base>"): totals across documents are kept per currency instead
 * (see `connectors/buckets.ts`), as Xero converts those at a rate its API doesn't give.
 */
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
