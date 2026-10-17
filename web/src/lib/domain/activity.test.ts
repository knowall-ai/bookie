import { describe, expect, it } from 'vitest';
import {
  activityCount,
  activityLevel,
  activityRange,
  activityTotal,
  activityWeeks,
  aggregateActivity,
  describeActivity,
  emptyDay,
  monthLabels,
} from './activity';

describe('aggregateActivity', () => {
  it('returns every day in the range, zeros included, oldest first', () => {
    const days = aggregateActivity([], '2026-02-27', '2026-03-02');
    expect(days.map((d) => d.date)).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(days[0]).toEqual(emptyDay('2026-02-27'));
  });

  it('counts each kind per day, ignoring times, out-of-range and undated events', () => {
    const days = aggregateActivity(
      [
        { date: '2026-03-14', kind: 'sales' },
        { date: '2026-03-14T00:00:00', kind: 'sales' },
        { date: '2026-03-14', kind: 'payments' },
        { date: '2026-03-15', kind: 'purchases' },
        { date: '2026-03-15', kind: 'quotes' },
        { date: '2026-03-15', kind: 'creditNotes' },
        { date: '2026-03-13', kind: 'sales' },
        { date: '2026-03-16', kind: 'sales' },
        { date: undefined, kind: 'sales' },
        { date: 'not a date', kind: 'sales' },
      ],
      '2026-03-14',
      '2026-03-15'
    );
    expect(days).toEqual([
      { date: '2026-03-14', sales: 2, purchases: 0, payments: 1, quotes: 0, creditNotes: 0 },
      { date: '2026-03-15', sales: 0, purchases: 1, payments: 0, quotes: 1, creditNotes: 1 },
    ]);
  });

  it('handles a range across the clocks changing', () => {
    const days = aggregateActivity(
      [{ date: '2026-03-30', kind: 'sales' }],
      '2026-03-28',
      '2026-03-30'
    );
    expect(days).toHaveLength(3);
    expect(days[2].sales).toBe(1);
  });
});

describe('activityRange', () => {
  it('covers the last year and starts on a Monday', () => {
    const { from, to } = activityRange('2026-10-17');
    expect(to).toBe('2026-10-17');
    expect(new Date(`${from}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(from <= '2025-10-18').toBe(true);
    expect(from > '2025-10-10').toBe(true);
  });
});

describe('filters and levels', () => {
  const day = {
    date: '2026-03-14',
    sales: 3,
    purchases: 1,
    payments: 2,
    quotes: 1,
    creditNotes: 1,
  };

  it('counts what each chip covers', () => {
    expect(activityCount(day)).toBe(8);
    expect(activityCount(day, 'sales')).toBe(4);
    expect(activityCount(day, 'purchases')).toBe(1);
    expect(activityCount(day, 'payments')).toBe(2);
    expect(activityTotal([day, day], 'payments')).toBe(4);
  });

  it('shades relative to the busiest day, with any activity visible', () => {
    expect(activityLevel(0, 10)).toBe(0);
    expect(activityLevel(1, 100)).toBe(1);
    expect(activityLevel(5, 10)).toBe(2);
    expect(activityLevel(8, 10)).toBe(4);
    expect(activityLevel(10, 10)).toBe(4);
    expect(activityLevel(3, 0)).toBe(0);
  });

  it('describes a day for the tooltip', () => {
    expect(describeActivity({ ...day, quotes: 0, creditNotes: 0 })).toBe(
      '14 Mar 2026: 3 invoices, 1 bill, 2 payments'
    );
    expect(describeActivity(day, 'sales')).toBe('14 Mar 2026: 3 invoices, 1 quote');
    expect(describeActivity(emptyDay('2026-03-15'))).toBe('15 Mar 2026: no activity');
  });
});

describe('layout', () => {
  it('splits days into Monday-first weeks, padding the first', () => {
    // 2026-03-04 is a Wednesday.
    const weeks = activityWeeks(aggregateActivity([], '2026-03-04', '2026-03-16'));
    expect(weeks).toHaveLength(3);
    expect(weeks[0].slice(0, 2)).toEqual([null, null]);
    expect(weeks[0][2]?.date).toBe('2026-03-04');
    expect(weeks[1][0]?.date).toBe('2026-03-09');
    expect(weeks[2].map((d) => d?.date)).toEqual(['2026-03-16']);
    expect(activityWeeks([])).toEqual([]);
  });

  it('labels months without crowding', () => {
    const weeks = activityWeeks(aggregateActivity([], '2026-01-19', '2026-04-30'));
    const labels = monthLabels(weeks);
    // January only has two weeks showing, so February takes over from it.
    expect(labels.map((l) => l.label)).toEqual(['Feb', 'Mar', 'Apr']);
    expect(labels[0].week).toBe(2);
  });
});
