import { describe, expect, it } from 'vitest';
import { plannedItemSchema } from './forecast-schema';

const valid = {
  description: 'Office rent',
  amount: '1750',
  direction: 'out',
  currency: 'GBP',
  date: '2026-11-01',
  repeat: 'monthly',
  endDate: '2027-06-01',
};

describe('plannedItemSchema', () => {
  it('accepts a repeating item and coerces the amount', () => {
    expect(plannedItemSchema.parse(valid)).toMatchObject({ amount: 1750, repeat: 'monthly' });
  });

  it('rejects zero or negative amounts, bad currencies and dates', () => {
    expect(plannedItemSchema.safeParse({ ...valid, amount: '0' }).success).toBe(false);
    expect(plannedItemSchema.safeParse({ ...valid, amount: '-5' }).success).toBe(false);
    expect(plannedItemSchema.safeParse({ ...valid, currency: 'pounds' }).success).toBe(false);
    expect(plannedItemSchema.safeParse({ ...valid, date: '1/11/2026' }).success).toBe(false);
    expect(plannedItemSchema.safeParse({ ...valid, description: ' ' }).success).toBe(false);
  });

  it('only allows an end date on a repeat, and not before the first date', () => {
    expect(plannedItemSchema.safeParse({ ...valid, repeat: undefined }).success).toBe(false);
    expect(plannedItemSchema.safeParse({ ...valid, endDate: '2026-10-01' }).success).toBe(false);
    expect(
      plannedItemSchema.safeParse({ ...valid, repeat: undefined, endDate: undefined }).success
    ).toBe(true);
  });
});
