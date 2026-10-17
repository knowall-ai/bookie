import { describe, expect, it } from 'vitest';
import { balanceTicks, niceTicks } from './axis';

describe('niceTicks', () => {
  it('uses round steps that cover the range', () => {
    expect(niceTicks(112_519, 123_041, 5)).toEqual([110_000, 115_000, 120_000, 125_000]);
    expect(niceTicks(-500, 2_000, 4)).toEqual([-1_000, 0, 1_000, 2_000]);
  });

  it('copes with a flat line', () => {
    const ticks = niceTicks(1_000, 1_000);
    expect(ticks[0]).toBeLessThan(1_000);
    expect(ticks.at(-1)).toBeGreaterThan(1_000);
  });
});

describe('balanceTicks', () => {
  it('brings zero in when the balance comes close to it', () => {
    expect(balanceTicks([300, 2_000])[0]).toBe(0);
    expect(balanceTicks([112_519, 123_041])[0]).toBeGreaterThan(0);
    expect(balanceTicks([-4_000, 1_000])[0]).toBeLessThanOrEqual(-4_000);
  });
});
