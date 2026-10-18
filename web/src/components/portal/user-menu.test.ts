import { describe, expect, it } from 'vitest';
import { initials, nextMenuIndex } from './user-menu';

describe('user menu helpers', () => {
  it('takes up to two initials', () => {
    expect(initials('Alex Morgan')).toBe('AM');
    expect(initials('  jordan   lee  ')).toBe('JL');
    expect(initials('Alex Brook Morgan')).toBe('AB');
    expect(initials('alex')).toBe('A');
    expect(initials('')).toBe('');
  });

  it('moves focus with the arrow, Home and End keys, wrapping round', () => {
    expect(nextMenuIndex('ArrowDown', -1, 2)).toBe(0);
    expect(nextMenuIndex('ArrowDown', 0, 2)).toBe(1);
    expect(nextMenuIndex('ArrowDown', 1, 2)).toBe(0);
    expect(nextMenuIndex('ArrowUp', -1, 2)).toBe(1);
    expect(nextMenuIndex('ArrowUp', 0, 2)).toBe(1);
    expect(nextMenuIndex('Home', 1, 2)).toBe(0);
    expect(nextMenuIndex('End', 0, 2)).toBe(1);
    expect(nextMenuIndex('a', 0, 2)).toBeNull();
    expect(nextMenuIndex('ArrowDown', -1, 0)).toBeNull();
  });
});
