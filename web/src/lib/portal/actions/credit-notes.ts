'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { CreditNoteInput } from '@/lib/domain/types';
import { describeError, type ActionResult } from './util';
import { creditNoteSchema } from './credit-note-schema';

export async function saveCreditNote(
  orgKey: string,
  id: string | undefined,
  input: CreditNoteInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = creditNoteSchema.parse(input) as CreditNoteInput;
    const { connector, base } = await orgContext(orgKey);
    const mod = connector.creditNotes;
    const save = id ? mod?.update?.bind(null, id) : mod?.create;
    if (!save)
      return { ok: false, error: 'This organisation does not allow editing credit notes here.' };
    const note = await save(parsed);
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: note.id } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

const actionSchema = z.enum(['approve', 'void', 'delete']);

export async function creditNoteAction(
  orgKey: string,
  id: string,
  action: z.infer<typeof actionSchema>
): Promise<ActionResult> {
  try {
    const parsed = actionSchema.parse(action);
    const { connector, base } = await orgContext(orgKey);
    const run = connector.creditNotes?.[parsed];
    if (!run) return { ok: false, error: 'This action is not available for this organisation.' };
    await run(z.string().min(1).parse(id));
    revalidatePath(base, 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
