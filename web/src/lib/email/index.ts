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
  readMailbox,
  resolveSenders,
  type DecideResult,
} from './graph';
import { canModerate, canReadShared, tokenScopes } from './mailbox';
import type {
  ApprovalDecision,
  ApprovalsView,
  EmailApprovalDetail,
  EmailsOverview,
  MailboxView,
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
 * Nothing is stored or cached across people. Errors never carry addresses or
 * subjects (the Graph helpers use fixed labels).
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
    const { items, incomplete } = await listApprovals(
      token,
      await resolveSenders(token, agentAddress)
    );
    return { status: 'ok', items, ...(incomplete ? { incomplete } : {}) };
  } catch (error) {
    // The person's own mailbox refused: the mail permissions aren't consented.
    if (error instanceof ApprovalGraphError && error.status === 403)
      return { status: 'no-consent' };
    console.warn('Email approvals:', error instanceof Error ? error.message : 'failed');
    return { status: 'error', error: FAILED };
  }
}

async function mailboxView(
  token: string,
  scopes: Set<string> | null,
  mailbox?: string
): Promise<MailboxView> {
  if (!mailbox) return { status: 'not-configured' };
  if (!canReadShared(scopes)) return { status: 'no-consent', mailbox };
  try {
    const read = await readMailbox(token, mailbox);
    return read.ok
      ? { status: 'ok', mailbox, folders: read.folders }
      : { status: 'no-access', mailbox };
  } catch (error) {
    console.warn('Accounts mailbox:', error instanceof Error ? error.message : 'failed');
    return { status: 'error', mailbox, error: FAILED };
  }
}

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
      mailbox: { status: 'error', mailbox: 'the accounts mailbox', error: FAILED },
    };
  }
  const scopes = tokenScopes(token);
  const [approvals, mailbox] = await Promise.all([
    approvalsView(token, scopes, settings.agentAddress),
    mailboxView(token, scopes, settings.accountsMailbox),
  ]);
  return { agentAddress: settings.agentAddress, approvals, mailbox };
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
      path: '/portal',
    });
    return { ok: true, status };
  }
  const { agentAddress } = await emailSettings(auth);
  if (!agentAddress) return { ok: false, reason: 'not-found' };
  const token = await auth.getToken('graph');
  return decideApproval(token, id, await resolveSenders(token, agentAddress), decision, reason);
}
