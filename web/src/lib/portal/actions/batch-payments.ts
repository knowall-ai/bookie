'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { BatchPaymentInput } from '@/lib/domain/types';
import { describeError, isoDate, type ActionResult } from './util';

const batchSchema = z.object({
  bankAccountId: z.string().min(1, 'Choose the account to pay from.'),
  date: isoDate,
  reference: z.string().trim().max(255).optional(),
  payments: z
    .array(
      z.object({
        invoiceId: z.string().min(1),
        amount: z.coerce.number().finite().positive('Every payment must be above zero.'),
      })
    )
    .min(1, 'Choose at least one bill.')
    .max(100, 'Pay up to 100 bills at a time.')
    .refine((p) => new Set(p.map((x) => x.invoiceId)).size === p.length, {
      message: 'Each bill can only be paid once in a batch.',
    }),
});

/**
 * Pay several approved bills in one batch (live books; the UI confirms).
 * Every bill is re-read first: it must be an approved bill with a known
 * amount due, and the payment can't exceed it.
 */
export async function recordBatchPayment(
  orgKey: string,
  input: BatchPaymentInput
): Promise<ActionResult<{ id: string; count: number }>> {
  try {
    const parsed = batchSchema.parse(input) as BatchPaymentInput;
    const { connector, base } = await orgContext(orgKey);
    const create = connector.payments?.createBatch;
    if (!create || !connector.invoices) {
      return { ok: false, error: 'This organisation does not allow batch payments here.' };
    }
    const bills = await Promise.all(
      parsed.payments.map((p) => connector.invoices!.get(p.invoiceId))
    );
    for (const [i, bill] of bills.entries()) {
      const label = bill.number ? `Bill ${bill.number}` : 'A bill';
      if (bill.type !== 'purchase') return { ok: false, error: `${label} is not a bill.` };
      if (bill.status !== 'authorised') {
        return { ok: false, error: `${label} is not awaiting payment.` };
      }
      // Unknown amount due (undefined) is never treated as zero or as "enough".
      const due = bill.amountDue as number | undefined;
      if (typeof due !== 'number') {
        return {
          ok: false,
          error: `${label}: the amount due isn't available, so it can't be paid here.`,
        };
      }
      if (parsed.payments[i].amount > due + 0.005) {
        return { ok: false, error: `${label}: the payment is more than the amount due.` };
      }
    }
    const currencies = new Set(bills.map((b) => b.currency));
    if (currencies.size > 1) {
      return { ok: false, error: 'Pay bills in one currency at a time.' };
    }
    const batch = await create({
      ...parsed,
      reference: parsed.reference || undefined,
      payments: parsed.payments.map((p) => ({
        invoiceId: p.invoiceId,
        amount: Math.round(p.amount * 100) / 100,
      })),
    });
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: batch.id, count: parsed.payments.length } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
