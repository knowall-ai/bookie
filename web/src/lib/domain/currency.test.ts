import { describe, expect, it } from 'vitest';
import { isForeign, toBaseAmount } from './currency';

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
});
