'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { BankTransferInput } from '@/lib/domain/types';
import { describeError, isoDate, type ActionResult } from './util';

const transferSchema = z
  .object({
    fromBankAccountId: z.string().min(1, 'Choose the account the money comes from.'),
    toBankAccountId: z.string().min(1, 'Choose the account the money goes to.'),
    date: isoDate,
    amount: z.coerce.number().finite().positive('Enter an amount above zero.'),
    reference: z.string().trim().max(255).optional(),
  })
  .refine((t) => t.fromBankAccountId !== t.toBankAccountId, {
    message: 'Choose two different bank accounts.',
  });

/** Transfer money between two of the organisation's bank accounts (live books; the UI confirms). */
export async function createBankTransfer(
  orgKey: string,
  input: BankTransferInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = transferSchema.parse(input) as BankTransferInput;
    const { connector, base } = await orgContext(orgKey);
    const create = connector.bank?.createTransfer;
    if (!create) {
      return { ok: false, error: 'This organisation does not allow bank transfers here.' };
    }
    const accounts = await connector.bank!.accounts();
    const from = accounts.find((a) => a.id === parsed.fromBankAccountId);
    const to = accounts.find((a) => a.id === parsed.toBankAccountId);
    if (!from || !to) return { ok: false, error: 'Choose two of your bank accounts.' };
    if (from.currency && to.currency && from.currency !== to.currency) {
      return {
        ok: false,
        error: `Transfers between ${from.currency} and ${to.currency} accounts need an exchange rate. Record this one in your accounting system.`,
      };
    }
    const transfer = await create({
      ...parsed,
      amount: Math.round(parsed.amount * 100) / 100,
      reference: parsed.reference || undefined,
    });
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: transfer.id } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
