'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { BankTransactionInput } from '@/lib/domain/types';
import { describeError, isoDate, lineItemSchema, type ActionResult } from './util';

const bankTransactionSchema = z.object({
  bankAccountId: z.string().min(1, 'Choose a bank account.'),
  type: z.enum(['spend', 'receive']),
  contactId: z.string().min(1, 'Choose a contact.'),
  date: isoDate,
  reference: z.string().trim().max(255).optional(),
  lineAmountType: z.enum(['exclusive', 'inclusive', 'none']).optional(),
  lineItems: z
    .array(lineItemSchema)
    .min(1, 'Add at least one line.')
    .refine((lines) => lines.some((l) => l.quantity * l.unitAmount !== 0), {
      message: 'Enter an amount on at least one line.',
    }),
});

/** Spend money / receive money: posts straight to the bank account (live books). */
export async function createBankTransaction(
  orgKey: string,
  input: BankTransactionInput
): Promise<ActionResult<{ id: string; bankAccountId: string }>> {
  try {
    const parsed = bankTransactionSchema.parse(input) as BankTransactionInput;
    const { connector, base } = await orgContext(orgKey);
    const create = connector.bank?.createTransaction;
    if (!create) {
      return { ok: false, error: 'This organisation does not allow spend or receive money here.' };
    }
    const transaction = await create(parsed);
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: transaction.id, bankAccountId: parsed.bankAccountId } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
