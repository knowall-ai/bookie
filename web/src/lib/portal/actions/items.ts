'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { ItemInput } from '@/lib/domain/types';
import { describeError, type ActionResult } from './util';

const price = z.coerce.number().finite().min(0, 'Prices cannot be negative.').optional();
const code = z.string().trim().max(20).optional();

const itemSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Enter an item code.')
    .max(30, 'Item codes are at most 30 characters.'),
  name: z.string().trim().min(1, 'Enter a name.').max(50, 'Names are at most 50 characters.'),
  description: z.string().trim().max(4000).optional(),
  salePrice: price,
  salesAccountCode: code,
  purchasePrice: price,
  purchaseAccountCode: code,
});

export async function saveItem(
  orgKey: string,
  id: string | undefined,
  input: ItemInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = itemSchema.parse(input) as ItemInput;
    const { connector, base } = await orgContext(orgKey);
    const mod = connector.items;
    const save = id ? mod?.update?.bind(null, id) : mod?.create;
    if (!save) return { ok: false, error: 'This organisation does not allow editing items here.' };
    const item = await save(parsed);
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: item.id } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
