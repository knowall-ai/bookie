import { describe, expect, it } from 'vitest';
import { activityRange, activityTotal } from '@/lib/domain/activity';
import { demoData, DEMO_TODAY } from '../data';
import { demoActivity } from './activity';

describe('demo activity', () => {
  it('derives the year from the demo documents and payments', async () => {
    const data = demoData('contoso');
    const { from, to } = activityRange(DEMO_TODAY());
    const days = await demoActivity(data)(from, to);
    const live = data.invoices.filter((i) => i.status !== 'deleted' && i.date >= from);
    expect(days.at(-1)?.date).toBe(to);
    expect(activityTotal(days, 'sales') - days.reduce((s, d) => s + d.quotes, 0)).toBe(
      live.filter((i) => i.type === 'sales').length
    );
    expect(activityTotal(days, 'purchases')).toBe(live.filter((i) => i.type === 'purchase').length);
    expect(activityTotal(days, 'payments')).toBeGreaterThan(0);
    expect(days.reduce((s, d) => s + d.creditNotes, 0)).toBe(6);
  });
});
