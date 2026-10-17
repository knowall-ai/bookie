'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { AccountInput } from '@/lib/domain/types';
import { describeError, type ActionResult } from './util';

const accountSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Enter a code.')
    .max(10, 'Codes are at most 10 characters.')
    .regex(/^[A-Za-z0-9.-]+$/, 'Codes use letters, numbers, dots and dashes only.'),
  name: z.string().trim().min(1, 'Enter a name.').max(150),
  type: z.string().trim().min(1, 'Choose an account type.').max(40),
  taxType: z.string().trim().max(60).optional(),
  description: z.string().trim().max(4000).optional(),
});

/** Add an account to the chart of accounts (live books). */
export async function createAccount(
  orgKey: string,
  input: AccountInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = accountSchema.parse(input) as AccountInput;
    const { connector, base } = await orgContext(orgKey);
    const create = connector.accounts?.create;
    if (!create) {
      return { ok: false, error: 'This organisation does not allow adding accounts here.' };
    }
    const account = await create({
      ...parsed,
      taxType: parsed.taxType || undefined,
      description: parsed.description || undefined,
    });
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: account.id } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
