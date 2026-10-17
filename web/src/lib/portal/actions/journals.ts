'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { ManualJournalInput } from '@/lib/domain/types';
import { describeError, type ActionResult } from './util';
import { manualJournalSchema } from './journal-schema';

/** Save a manual journal as a draft or post it (live books). */
export async function createManualJournal(
  orgKey: string,
  input: ManualJournalInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = manualJournalSchema.parse(input) as ManualJournalInput;
    const { connector, base } = await orgContext(orgKey);
    const create = connector.journals?.create;
    if (!create) {
      return { ok: false, error: 'This organisation does not allow manual journals here.' };
    }
    const journal = await create(parsed);
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: journal.id } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

const statusChangeSchema = z.object({
  id: z.string().trim().min(1).max(200),
  change: z.enum(['posted', 'deleted', 'voided']),
});

/** Post or delete a draft journal, or void a posted one (live books). */
export async function journalStatusAction(
  orgKey: string,
  id: string,
  change: 'posted' | 'deleted' | 'voided'
): Promise<ActionResult<{ status: string }>> {
  try {
    const parsed = statusChangeSchema.parse({ id, change });
    const { connector, base } = await orgContext(orgKey);
    const setStatus = connector.journals?.setStatus;
    if (!setStatus) {
      return { ok: false, error: 'This organisation does not allow changing journals here.' };
    }
    const journal = await setStatus(parsed.id, parsed.change);
    revalidatePath(base, 'layout');
    return { ok: true, data: { status: journal.status } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
