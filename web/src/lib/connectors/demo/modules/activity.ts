import type { ActivityDay, IsoDate } from '@/lib/domain/types';
import { addDaysIso, aggregateActivity, type ActivityEvent } from '@/lib/domain/activity';
import { DEMO_TODAY, type DemoData } from '../data';

/**
 * Fictional quote and credit-note dates for the activity chart, as days before
 * today. Contoso quotes most weeks and issues the odd credit note; the data
 * set has no quotes module of its own here, so the dates live with the chart.
 */
const QUOTE_DAYS_AGO = [
  2, 6, 9, 13, 17, 22, 27, 29, 34, 38, 43, 48, 52, 57, 61, 66, 71, 76, 80, 85, 92, 99, 104, 111,
  117, 124, 131, 137, 145, 152, 160, 168, 175, 183, 191, 199, 208, 216, 225, 234, 244, 255, 267,
  281, 296, 312, 330, 348,
];
const CREDIT_NOTE_DAYS_AGO = [11, 47, 96, 163, 233, 301];

/** Invoices and bills by date, their payments by payment date, plus the fixtures above. */
export function demoActivityEvents(data: DemoData, today: IsoDate): ActivityEvent[] {
  const live = data.invoices.filter((i) => i.status !== 'deleted');
  return [
    ...live.map((i): ActivityEvent => ({
      date: i.date,
      kind: i.type === 'sales' ? 'sales' : 'purchases',
    })),
    ...live.flatMap((i) =>
      (i.payments ?? []).map((p): ActivityEvent => ({ date: p.date, kind: 'payments' }))
    ),
    ...QUOTE_DAYS_AGO.map((d): ActivityEvent => ({ date: addDaysIso(today, -d), kind: 'quotes' })),
    ...CREDIT_NOTE_DAYS_AGO.map((d): ActivityEvent => ({
      date: addDaysIso(today, -d),
      kind: 'creditNotes',
    })),
  ];
}

export function demoActivity(data: DemoData) {
  return async (from: IsoDate, to: IsoDate): Promise<ActivityDay[]> =>
    aggregateActivity(demoActivityEvents(data, DEMO_TODAY()), from, to);
}
