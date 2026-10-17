import { z } from 'zod';
import { isoDate, lineItemSchema } from './util';

export const creditNoteSchema = z.object({
  type: z.enum(['sales', 'purchase']),
  contactId: z.string().min(1, 'Choose a contact.'),
  date: isoDate,
  number: z.string().trim().max(255).optional(),
  reference: z.string().trim().max(255).optional(),
  currency: z.string().length(3).optional(),
  lineAmountType: z.enum(['exclusive', 'inclusive', 'none']).optional(),
  status: z.enum(['draft', 'authorised']).optional(),
  lineItems: z.array(lineItemSchema).min(1, 'Add at least one line.'),
});

export const allocationSchema = z.object({
  invoiceId: z.string().trim().min(1, 'Choose an invoice.'),
  amount: z.coerce
    .number()
    .finite()
    .positive('Enter an amount above zero.')
    .transform((n) => Math.round(n * 100) / 100),
  date: isoDate,
});

export const noteSchema = z.object({
  entity: z.enum(['invoice', 'quote', 'credit-note', 'contact']),
  id: z.string().trim().min(1),
  // A sanity cap; the source rejects anything it considers too long with its own message.
  note: z
    .string()
    .trim()
    .min(1, 'Write a note first.')
    .max(2500, 'Keep notes under 2,500 characters.'),
});
