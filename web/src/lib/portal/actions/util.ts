import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { isConnectorError } from '@/lib/connectors/types';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.');

/** A source exchange rate: units of document currency per one base unit. */
export const currencyRateSchema = z.coerce
  .number()
  .finite()
  .positive('The exchange rate must be above zero.')
  .optional();

export const lineItemSchema = z.object({
  itemCode: z.string().trim().max(60).optional(),
  description: z.string().trim().max(4000).default(''),
  quantity: z.coerce.number().finite(),
  unitAmount: z.coerce.number().finite(),
  discountRate: z.coerce.number().min(0).max(100).optional(),
  accountCode: z.string().trim().max(40).optional(),
  taxType: z.string().trim().max(60).optional(),
});

/** Turn any failure into a message that is safe to show the user. */
export function describeError(error: unknown): string {
  // Let Next.js redirects and not-founds (e.g. an expired sign-in) through.
  unstable_rethrow(error);
  if (isConnectorError(error)) return error.message;
  if (error instanceof z.ZodError) return error.issues.map((i) => i.message).join(' ');
  console.error('[bookie] action failed', error);
  return 'Something went wrong. Please try again.';
}
