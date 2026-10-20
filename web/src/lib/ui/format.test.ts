import { describe, expect, it } from 'vitest';
import { formatDateTimeUk } from './format';

describe('formatDateTimeUk', () => {
  it('shows UK time whatever the server time zone (BST in October, GMT in December)', () => {
    expect(formatDateTimeUk('2026-10-20T11:17:00Z')).toBe('20 Oct, 12:17');
    expect(formatDateTimeUk('2026-12-01T09:05:00Z', true)).toBe('1 Dec 2026, 09:05');
    expect(formatDateTimeUk('not a date')).toBe('not a date');
  });
});
