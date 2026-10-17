import { z } from 'zod';
import { isoDate } from './util';

/** Cents, so floating point never makes a balanced journal look unbalanced. */
export const toCents = (amount: number) => Math.round(amount * 100);

export const journalLineSchema = z.object({
  accountCode: z.string().trim().min(1, 'Choose an account on every line.').max(40),
  description: z.string().trim().max(4000).optional(),
  amount: z.coerce
    .number()
    .finite()
    .refine((n) => n !== 0, 'Enter a debit or credit on every line.'),
  taxType: z.string().trim().max(60).optional(),
});

/** A manual journal must balance: total debits equal total credits. */
export const manualJournalSchema = z
  .object({
    date: isoDate,
    narration: z.string().trim().min(1, 'Enter a narration.').max(4000),
    status: z.enum(['draft', 'posted']).optional(),
    lines: z.array(journalLineSchema).min(2, 'A journal needs at least two lines.'),
  })
  .refine((j) => j.lines.reduce((s, l) => s + toCents(l.amount), 0) === 0, {
    message: 'Debits and credits must balance.',
    path: ['lines'],
  });
