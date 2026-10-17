'use server';

import { revalidatePath } from 'next/cache';
import { orgContext } from '@/lib/portal/context';
import type { HistoryEntity } from '@/lib/domain/types';
import { describeError, type ActionResult } from './util';
import { noteSchema } from './credit-note-schema';

/** Add a note to a document's or contact's history (Xero "Add note"). */
export async function addHistoryNote(
  orgKey: string,
  entity: HistoryEntity,
  id: string,
  note: string
): Promise<ActionResult> {
  try {
    const parsed = noteSchema.parse({ entity, id, note });
    const { connector, base } = await orgContext(orgKey);
    const add = connector.history?.addNote;
    if (!add) return { ok: false, error: 'This organisation does not support notes here.' };
    await add(parsed.entity, parsed.id, parsed.note);
    revalidatePath(base, 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
