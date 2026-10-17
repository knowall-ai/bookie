import { describe, expect, it } from 'vitest';
import { bucketOf } from './buckets';

describe('dashboard buckets', () => {
  it('totals base-currency documents', () => {
    expect(
      bucketOf(
        [
          { amount: 10.1, currency: 'GBP' },
          { amount: 5.2, currency: '' },
        ],
        'GBP'
      )
    ).toEqual({ count: 2, total: 15.3 });
  });

  it('counts but never sums an amount the source does not report', () => {
    const bucket = bucketOf(
      [
        { amount: 10, currency: 'GBP' },
        { amount: undefined, currency: 'GBP' },
      ],
      'GBP'
    );
    expect(bucket.count).toBe(2);
    expect(bucket.total).toBeUndefined();
    expect(bucket.unknownCount).toBe(1);
  });

  it('keeps other currencies separate instead of converting them', () => {
    const bucket = bucketOf(
      [
        { amount: 80, currency: 'EUR' },
        { amount: 10, currency: 'GBP' },
        { amount: 20, currency: 'EUR' },
      ],
      'GBP'
    );
    expect(bucket.total).toBeUndefined();
    expect(bucket.byCurrency).toEqual([
      { currency: 'GBP', total: 10 },
      { currency: 'EUR', total: 100 },
    ]);
  });

  it('is zero when empty', () => {
    expect(bucketOf([], 'GBP')).toEqual({ count: 0, total: 0 });
  });
});
