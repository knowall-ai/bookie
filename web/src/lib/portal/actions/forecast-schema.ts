import { z } from 'zod';
import { isoDate } from './util';

/** A planned item as the user types it in (Reporting › Cash flow forecast). */
export const plannedItemSchema = z
  .object({
    description: z.string().trim().min(1, 'Describe the item.').max(200),
    amount: z.coerce
      .number()
      .finite()
      .positive('Enter an amount above zero.')
      .max(1_000_000_000_000, 'That amount is too large.'),
    direction: z.enum(['in', 'out']),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, 'Choose a currency.'),
    date: isoDate,
    repeat: z.enum(['weekly', 'monthly', 'quarterly']).optional(),
    endDate: isoDate.optional(),
  })
  .refine((v) => !v.endDate || v.repeat, {
    message: 'An end date only applies to a repeating item.',
    path: ['endDate'],
  })
  .refine((v) => !v.endDate || v.endDate >= v.date, {
    message: 'The end date must be on or after the first date.',
    path: ['endDate'],
  });

export type PlannedItemInput = z.input<typeof plannedItemSchema>;

/** Most planned items one organisation can hold. */
export const MAX_PLANNED_ITEMS = 200;
