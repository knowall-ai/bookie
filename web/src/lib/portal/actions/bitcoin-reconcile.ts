'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/context';
import { draftReconcileJournal, postReconcileJournal } from '@/lib/bitcoin/reconcile-service';
import { orgContext } from '@/lib/portal/context';
import { describeError, type ActionResult } from './util';
import { draftJournalSchema, postJournalSchema } from './bitcoin-schema';

/**
 * Accounting › Bank accounts › a wallet › Reconcile. Drafting creates unposted
 * general-journal lines in the books; posting them is a separate, confirmed step.
 * Both re-resolve the organisation with orgContext() and the wallet from the source.
 */
export async function draftBitcoinJournalAction(
  input: z.input<typeof draftJournalSchema>
): Promise<ActionResult<{ batchId: string; batchCode: string; lines: number }>> {
  try {
    const parsed = draftJournalSchema.parse(input);
    const auth = await requireAuth(`/portal/${encodeURIComponent(parsed.orgKey)}`);
    const { org, connector, base } = await orgContext(encodeURIComponent(parsed.orgKey));
    const draft = await draftReconcileJournal(auth, { org, connector }, parsed.walletId, {
      txids: parsed.txids,
      counterAccount: parsed.counterAccount,
      feeAccount: parsed.feeAccount,
    });
    revalidatePath(`${base}/accounting`, 'layout');
    return {
      ok: true,
      data: { batchId: draft.batchId, batchCode: draft.batchCode, lines: draft.lines.length },
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function postBitcoinJournalAction(
  input: z.input<typeof postJournalSchema>
): Promise<ActionResult> {
  try {
    const parsed = postJournalSchema.parse(input);
    const auth = await requireAuth(`/portal/${encodeURIComponent(parsed.orgKey)}`);
    const { org, connector, base } = await orgContext(encodeURIComponent(parsed.orgKey));
    await postReconcileJournal(auth, { org, connector }, parsed.walletId, parsed.batchId);
    revalidatePath(`${base}/accounting`, 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
