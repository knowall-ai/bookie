'use server';

import { z } from 'zod';
import { assertCanManageSettings } from '@/lib/auth/access';
import { requireAuth } from '@/lib/auth/context';
import { MAX_REASON_LENGTH } from '@/lib/email/approvals';
import { decideEmailApproval, getEmailApprovalDetail } from '@/lib/email';
import type { EmailApprovalDetail } from '@/lib/email/types';
import { describeError, type ActionResult } from './util';

/** A Graph message id (base64url-ish), never a path. */
const messageIdSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[\w=+/-]+$/, 'That is not an email Bookie knows.');

const decisionSchema = z
  .strictObject({
    id: messageIdSchema,
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(MAX_REASON_LENGTH).optional(),
  })
  .refine((d) => d.decision === 'approve' || !!d.reason, {
    message: 'Say why you are rejecting it. Bookie passes the reason on.',
    path: ['reason'],
  });

const NOT_PENDING = 'This email has already been decided, or Exchange has dropped the request.';

/** The held email itself, for the expanded row. Members only. */
export async function emailApprovalDetailAction(
  id: string
): Promise<ActionResult<EmailApprovalDetail>> {
  try {
    const auth = await requireAuth('/portal/emails');
    assertCanManageSettings(auth.user);
    const detail = await getEmailApprovalDetail(auth, messageIdSchema.parse(id));
    if (!detail) return { ok: false, error: 'That email isn’t in your approvals any more.' };
    return { ok: true, data: detail };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** Approve or reject one of Bookie's held emails, as the signed-in moderator. */
export async function decideEmailApprovalAction(
  input: z.input<typeof decisionSchema>
): Promise<ActionResult<{ status: 'approved' | 'rejected' }>> {
  try {
    const auth = await requireAuth('/portal/emails');
    assertCanManageSettings(auth.user);
    const { id, decision, reason } = decisionSchema.parse(input);
    const result = await decideEmailApproval(auth, id, decision, reason || undefined);
    if (result.ok) return { ok: true, data: { status: result.status } };
    return {
      ok: false,
      error:
        result.reason === 'not-pending'
          ? NOT_PENDING
          : result.reason === 'unanswerable'
            ? 'Exchange didn’t say where to send the decision. Approve or reject it in Outlook instead.'
            : 'That email isn’t in your approvals any more.',
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
