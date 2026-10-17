'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { AllocationInput } from '@/lib/domain/types';
import { describeError, type ActionResult } from './util';
import { allocationSchema } from './credit-note-schema';

/** Apply part or all of a credit note's remaining credit to an outstanding invoice or bill. */
export async function allocateCreditNote(
  orgKey: string,
  creditNoteId: string,
  input: AllocationInput
): Promise<ActionResult> {
  try {
    const id = z.string().trim().min(1).parse(creditNoteId);
    const parsed = allocationSchema.parse(input);
    const { connector, base } = await orgContext(orgKey);
    const mod = connector.creditNotes;
    if (!mod?.allocate) {
      return {
        ok: false,
        error: mod?.allocationNote ?? 'This organisation cannot allocate credit here.',
      };
    }
    // Re-check against the source's own figures before writing.
    const [note, invoice] = await Promise.all([
      mod.get(id),
      connector.invoices?.get(parsed.invoiceId),
    ]);
    if (!invoice || invoice.contact.id !== note.contact.id || invoice.type !== note.type) {
      return { ok: false, error: 'Choose an outstanding document for the same contact.' };
    }
    if (note.remainingCredit === undefined || parsed.amount > note.remainingCredit + 0.005) {
      return { ok: false, error: 'The amount is more than the credit remaining.' };
    }
    if (parsed.amount > invoice.amountDue + 0.005) {
      return { ok: false, error: 'The amount is more than the amount due on that document.' };
    }
    await mod.allocate(id, parsed);
    revalidatePath(base, 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
