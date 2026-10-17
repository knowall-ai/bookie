'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { PaymentInput } from '@/lib/domain/types';
import { currencyRateSchema, describeError, isoDate, type ActionResult } from './util';

const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  bankAccountId: z.string().min(1, 'Choose the account the money was paid into or from.'),
  date: isoDate,
  amount: z.coerce.number().finite().positive('Enter an amount above zero.'),
  reference: z.string().trim().max(255).optional(),
  currencyRate: currencyRateSchema,
});

/** Record a payment against an approved invoice or bill. The UI confirms first. */
export async function recordPayment(
  orgKey: string,
  input: PaymentInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = paymentSchema.parse(input) as PaymentInput;
    const { connector, base } = await orgContext(orgKey);
    const create = connector.payments?.create;
    if (!create || !connector.invoices) {
      return { ok: false, error: 'This organisation does not allow recording payments here.' };
    }
    // Re-read the document so the amount can't exceed what is actually due.
    const invoice = await connector.invoices.get(parsed.invoiceId);
    if (connector.payments?.createFor && !connector.payments.createFor.includes(invoice.type)) {
      return { ok: false, error: 'This organisation does not allow paying this document here.' };
    }
    if (invoice.status !== 'authorised') {
      return { ok: false, error: 'Only approved documents awaiting payment can be paid.' };
    }
    if (parsed.amount > invoice.amountDue + 0.005) {
      return { ok: false, error: 'The payment is more than the amount due.' };
    }
    const payment = await create(parsed);
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: payment.id } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
