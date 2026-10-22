import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import { configStoreFor } from '@/lib/config';
import type { EmailSettings } from '@/lib/config/types';
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { ReauthRequiredError } from '@/lib/auth/tokens';
import { demoApprovalDetail, demoDecide, demoEmailsOverview, type DemoDecisions } from './demo';
import {
  ApprovalGraphError,
  decideApproval,
  getApprovalDetail,
  listApprovals,
  isApprover,
  readMailbox,
  resolveSenders,
  type DecideResult,
} from './graph';
import { canModerate, canReadShared, tokenScopes, mailSetup, MAILBOX_FOLDERS } from './mailbox';
import type {
  ApprovalDecision,
  ApprovalsView,
  EmailApprovalDetail,
  EmailsOverview,
  MailboxView,
  SharedMailbox,
} from './types';

/**
 * Bookie's emails, read live as the signed-in person with their delegated Graph
 * token (`getToken('graph')` carries what the tenant consented to Bookie):
 *
 * - Awaiting approval: Exchange moderation requests for Bookie's external email
 *   in the person's OWN mailbox (Mail.ReadWrite, Mail.Send). Only moderators get them.
 * - The accounts mailbox: read through Exchange's own permissions (Mail.Read.Shared),
 *   so only people with access to it see it.
 *
 * Only the Email tab's pending count is briefly cached, separately for each tenant and
 * person. Errors never carry addresses or subjects (the Graph helpers use fixed labels).
 */

const FAILED = 'Microsoft 365 didn’t answer. Try again in a minute.';

async function emailSettings(auth: AuthContext): Promise<EmailSettings> {
  return (await configStoreFor(auth).getSettings()).email ?? {};
}

async function approvalsView(
  token: string,
  scopes: Set<string> | null,
  agentAddress?: string
): Promise<ApprovalsView> {
  if (!agentAddress) return { status: 'not-configured' };
  if (!canModerate(scopes)) return { status: 'no-consent' };
  try {
    const senders = await resolveSenders(token, agentAddress);
    const approver = await isApprover(token, senders);
    if (!approver) return { status: 'ok', isApprover: false, items: [] };
    const { items, incomplete } = await listApprovals(token, senders);
    return { status: 'ok', isApprover: true, items, ...(incomplete ? { incomplete } : {}) };
  } catch (error) {
    // The person's own mailbox refused: the mail permissions aren't consented.
    if (error instanceof ApprovalGraphError && error.status === 403)
      return { status: 'no-consent' };
    console.warn('Email approvals:', error instanceof Error ? error.name : 'failed');
    return { status: 'error', error: FAILED };
  }
}

async function mailboxView(
  token: string,
  scopes: Set<string> | null,
  shared: SharedMailbox
): Promise<MailboxView> {
  const { address: mailbox, ...metadata } = shared;
  const identity = { mailbox, ...metadata };
  if (!canReadShared(scopes)) return { status: 'no-consent', ...identity };
  try {
    const read = await readMailbox(
      token,
      mailbox,
      shared.capture ? MAILBOX_FOLDERS : MAILBOX_FOLDERS.filter((f) => f.key === 'inbox')
    );
    return read.ok
      ? { status: 'ok', ...identity, folders: read.folders }
      : { status: 'no-access', ...identity };
  } catch (error) {
    console.warn('Shared mailbox:', error instanceof Error ? error.name : 'failed');
    return { status: 'error', ...identity, error: FAILED };
  }
}

/** The Email tab's badge count, per tenant and person, for 60 seconds. */
const pendingCounts = new Map<string, { count: number; expires: number }>();
/** Bumped when a person decides, so a count read before the decision isn't cached after it. */
const pendingGeneration = new Map<string, number>();
const pendingKey = (auth: AuthContext) => JSON.stringify([auth.user.tenantId, auth.user.id]);

/** Demo only: decisions made in this browser, kept in a cookie so the server holds nothing. */
const DEMO_COOKIE = 'bookie-demo-email-decisions';

async function demoDecisions(): Promise<DemoDecisions> {
  try {
    const raw = JSON.parse((await cookies()).get(DEMO_COOKIE)?.value ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v === 'approved' || v === 'rejected')
    ) as DemoDecisions;
  } catch {
    return {};
  }
}

export async function getEmailsOverview(auth: AuthContext): Promise<EmailsOverview> {
  if (auth.mode === 'demo') return demoEmailsOverview(await demoDecisions());
  let settings: EmailSettings;
  let token: string;
  try {
    [settings, token] = await Promise.all([emailSettings(auth), auth.getToken('graph')]);
  } catch (error) {
    // An expired sign-in still goes back to sign-in; anything else shows on the page, not as a crash.
    unstable_rethrow(error);
    if (error instanceof ReauthRequiredError) throw error;
    console.warn("Bookie's emails:", error instanceof Error ? error.name : 'failed');
    return {
      approvals: { status: 'error', error: FAILED },
      mailboxes: [],
    };
  }
  const scopes = tokenScopes(token);
  const { agentMailbox, sharedMailboxes } = mailSetup(settings);
  const [approvals, mailboxes] = await Promise.all([
    approvalsView(token, scopes, agentMailbox),
    Promise.all(sharedMailboxes.map((mailbox) => mailboxView(token, scopes, mailbox))),
  ]);
  return { agentAddress: agentMailbox, approvals, mailboxes };
}

/** The held email; null when the id isn't one of Bookie's requests in the person's mailbox. */
export async function getEmailApprovalDetail(
  auth: AuthContext,
  id: string
): Promise<EmailApprovalDetail | null> {
  if (auth.mode === 'demo') return demoApprovalDetail(id, await demoDecisions());
  const { agentAddress } = await emailSettings(auth);
  if (!agentAddress) return null;
  const token = await auth.getToken('graph');
  return getApprovalDetail(token, id, await resolveSenders(token, agentAddress));
}

/** Send the person's decision to Exchange. Only a still-pending request is answered. */
export async function decideEmailApproval(
  auth: AuthContext,
  id: string,
  decision: ApprovalDecision,
  reason?: string
): Promise<DecideResult> {
  if (auth.mode === 'demo') {
    const decisions = await demoDecisions();
    const status = demoDecide(id, decision, decisions);
    if (!status) {
      return { ok: false, reason: demoApprovalDetail(id, decisions) ? 'not-pending' : 'not-found' };
    }
    (await cookies()).set(DEMO_COOKIE, JSON.stringify({ ...decisions, [id]: status }), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    return { ok: true, status };
  }
  const { agentAddress } = await emailSettings(auth);
  if (!agentAddress) return { ok: false, reason: 'not-found' };
  const token = await auth.getToken('graph');
  const result = await decideApproval(
    token,
    id,
    await resolveSenders(token, agentAddress),
    decision,
    reason
  );
  // After the vote, so the badge can't re-cache the email as still waiting.
  const key = pendingKey(auth);
  pendingCounts.delete(key);
  pendingGeneration.set(key, (pendingGeneration.get(key) ?? 0) + 1);
  return result;
}

/** A short-lived count only, isolated by the verified tenant and person. */
export async function pendingApprovalCount(auth: AuthContext): Promise<number> {
  if (auth.user.userType !== 'Member') return 0;
  if (auth.mode === 'demo') {
    const view = demoEmailsOverview(await demoDecisions()).approvals;
    return view.status === 'ok' ? view.items.filter((item) => item.status === 'pending').length : 0;
  }
  const key = pendingKey(auth);
  const cached = pendingCounts.get(key);
  if (cached && cached.expires > Date.now()) return cached.count;
  const generation = pendingGeneration.get(key) ?? 0;
  let count = 0;
  try {
    const { agentAddress } = await emailSettings(auth);
    if (agentAddress) {
      const token = await auth.getToken('graph');
      if (canModerate(tokenScopes(token))) {
        const { items } = await listApprovals(token, await resolveSenders(token, agentAddress));
        count = items.filter((item) => item.status === 'pending').length;
      }
    }
  } catch (error) {
    console.warn('Pending email approvals:', error instanceof Error ? error.name : 'Error');
  }
  for (const [entry, value] of pendingCounts) {
    if (value.expires <= Date.now()) pendingCounts.delete(entry);
  }
  // A decision made while this was reading may have changed the count: don't cache it.
  if ((pendingGeneration.get(key) ?? 0) === generation) {
    pendingCounts.set(key, { count, expires: Date.now() + 60_000 });
  }
  return count;
}
