import { describe, expect, it } from 'vitest';
import { excludedNote, isForeign, sumInBase, toBaseAmount } from './currency';

describe('base-currency helpers', () => {
  it('treats the base currency (any case) as not foreign', () => {
    expect(isForeign('GBP', 'GBP')).toBe(false);
    expect(isForeign('gbp', 'GBP')).toBe(false);
    expect(isForeign('EUR', 'GBP')).toBe(true);
    expect(isForeign('', 'GBP')).toBe(false);
  });

  it('converts only with the source rate (foreign units per base unit)', () => {
    expect(toBaseAmount(116.48, 'EUR', 'GBP', 1.1648)).toBe(100);
    expect(toBaseAmount(50, 'GBP', 'GBP', undefined)).toBe(50);
    expect(toBaseAmount(50, 'EUR', 'GBP', undefined)).toBeUndefined();
    expect(toBaseAmount(50, 'EUR', 'GBP', 0)).toBeUndefined();
  });

  it('sums in base currency and counts what it had to leave out', () => {
    const docs = [
      { currency: 'GBP', amount: 100 },
      { currency: 'EUR', currencyRate: 1.25, amount: 125 },
      { currency: 'EUR', amount: 999 },
      { currency: 'USD', amount: 1 },
    ];
    expect(sumInBase(docs, (d) => d.amount, 'GBP')).toEqual({
      count: 2,
      total: 200,
      excluded: 2,
      excludedCurrencies: ['EUR', 'USD'],
    });
  });

  it('writes a note only when something was left out', () => {
    expect(excludedNote(0, [], 'invoice', 'Xero')).toBeUndefined();
    expect(excludedNote(1, ['EUR'], 'invoice', 'Business Central')).toBe(
      "1 EUR invoice isn't included in these totals: Business Central gives no exchange rate for it."
    );
    expect(excludedNote(2, ['EUR'], 'bill', 'Xero')).toContain("2 EUR bills aren't included");
  });
});
