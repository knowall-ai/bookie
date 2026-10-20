// Copied from knowall-ai/agents-portal src/lib/approvals.ts @ d0f5af6 (PR #143); keep in step
// with it and with knowall-ai/sallie. Only the import paths differ.
// Exchange moderation requests for an agent's outgoing email: reading them
// from the moderator's mailbox and building the decision Exchange accepts.
//
// A transport rule holds the agent's external email and sends each moderator
// an "Approval requested:" message (class IPM.Note.Microsoft.Approval.Request)
// with the held email attached. A decision is a reply to that request sent to
// the arbitration mailbox in its Reply-To, carrying the voting-button class and
// verb, and the request's report tag: without the tag Exchange answers "can't
// be processed ... already processed" and the email stays held.
import type { ApprovalDecision, ApprovalStatus, EmailApproval } from './types';

/** PR_MESSAGE_CLASS */
export const MESSAGE_CLASS_PROP = 'String 0x001A';
/** PR_REPORT_TAG: ties a decision to its request */
export const REPORT_TAG_PROP = 'Binary 0x0031';
/**
 * PR_LAST_VERB_EXECUTED: Outlook's vote (1 approve, 2 reject), 102 for a reply
 * (how a vote is sent, by the portal too), 103 reply all, 104 forward
 */
export const LAST_VERB_PROP = 'Integer 0x1081';
/** PidLidVerbResponse: the voting button chosen */
export const VERB_RESPONSE_PROP = 'String {00062008-0000-0000-C000-000000000046} Id 0x8524';

export const REQUEST_CLASS = 'IPM.Note.Microsoft.Approval.Request';
const REPLY_CLASS: Record<ApprovalDecision, string> = {
  approve: 'IPM.Note.Microsoft.Approval.Reply.Approve',
  reject: 'IPM.Note.Microsoft.Approval.Reply.Reject',
};
const VERB: Record<ApprovalDecision, 'Approve' | 'Reject'> = {
  approve: 'Approve',
  reject: 'Reject',
};

/** Exchange Online drops an undecided moderation request after two days. */
export const REQUEST_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000;
/** Decided and expired requests stay listed this long, for the record */
export const HISTORY_DAYS = 14;
/** Longest reject reason passed to Exchange; it lands in the agent's rejection notice */
export const MAX_REASON_LENGTH = 2000;

const REQUEST_PREFIX = /^Approval requested:\s*/i;

export interface ExtendedProperty {
  id: string;
  value: string;
}

/** The fields of a moderation request the portal reads from Graph */
export interface GraphApprovalRequest {
  id: string;
  subject?: string | null;
  receivedDateTime: string;
  parentFolderId?: string;
  from?: { emailAddress?: { address?: string | null } } | null;
  replyTo?: { emailAddress?: { name?: string | null; address?: string | null } }[];
  body?: { contentType?: string; content?: string | null } | null;
  singleValueExtendedProperties?: ExtendedProperty[];
}

/**
 * Graph's $filter for moderation requests from any of the agent's addresses
 * (primary SMTP, aliases, UPN), received since `since`
 */
export function requestFilter(senders: string[], since: Date): string {
  const from = senders
    .map((s) => `from/emailAddress/address eq '${s.replace(/'/g, "''")}'`)
    .join(' or ');
  return [
    `singleValueExtendedProperties/any(ep: ep/id eq '${MESSAGE_CLASS_PROP}' and ep/value eq '${REQUEST_CLASS}')`,
    `(${from})`,
    `receivedDateTime ge ${since.toISOString()}`,
  ].join(' and ');
}

/** The extended properties the list needs, for $expand */
export const REQUEST_PROPS_EXPAND = `singleValueExtendedProperties($filter=id eq '${LAST_VERB_PROP}' or id eq '${VERB_RESPONSE_PROP}')`;

function prop(request: GraphApprovalRequest, id: string): string | undefined {
  // Graph echoes ids in its own case and spacing ("String 0x1a"), so compare loosely
  const norm = (s: string) => s.toLowerCase().replace(/0x0*/g, '0x').replace(/\s+/g, ' ');
  return request.singleValueExtendedProperties?.find((p) => norm(p.id) === norm(id))?.value;
}

/**
 * What the moderator's mailbox says about a request. A decision recorded by
 * the portal (verb response) or by Outlook's voting buttons (last verb 1 or 2)
 * is final; a reply (how any vote reaches Exchange), or Exchange moving the
 * request out of the inbox, means it was dealt with somewhere we cannot read.
 * Other verbs, such as forwarding the request to someone, are not decisions. Otherwise it waits,
 * until Exchange's two-day lifetime runs out.
 */
export function approvalStatus(
  request: GraphApprovalRequest,
  inboxFolderId: string | undefined,
  now: Date = new Date()
): ApprovalStatus {
  const verb = prop(request, VERB_RESPONSE_PROP);
  if (verb === 'Approve') return 'approved';
  if (verb === 'Reject') return 'rejected';
  const last = prop(request, LAST_VERB_PROP);
  if (last === '1') return 'approved';
  if (last === '2') return 'rejected';
  if (last === '102') return 'decided';
  if (inboxFolderId && request.parentFolderId && request.parentFolderId !== inboxFolderId) {
    return 'decided';
  }
  const age = now.getTime() - new Date(request.receivedDateTime).getTime();
  return age >= REQUEST_LIFETIME_MS ? 'expired' : 'pending';
}

/** "Approval requested:Quote for Acme" → "Quote for Acme" */
export function heldSubject(subject: string | null | undefined): string {
  const trimmed = (subject ?? '').replace(REQUEST_PREFIX, '').trim();
  return trimmed || '(no subject)';
}

/**
 * The request body (as text) names the held recipients and quotes the start of
 * the email under a rule:
 *
 *   Sallie has asked you to approve the attached message for delivery to:
 *
 *   jose; mariana
 *   ________________________________
 *   A preview of the message is below. To view the complete message, open the attachment.
 *   <preview>
 *
 * Exchange writes it in English for this tenant; anything unrecognised gives
 * no recipients and no preview rather than the template text.
 */
export function parseRequestBody(text: string | null | undefined): {
  recipients: string[];
  preview: string;
} {
  const body = (text ?? '').replace(/\r\n/g, '\n');
  const rule = body.search(/\n_{8,}\n/);
  let recipients: string[] = [];
  const to = body.match(/for delivery to:\s*\n([\s\S]*?)(?:\n_{8,}|$)/i);
  if (to) {
    recipients = to[1]
      .split(/[;\n]/)
      .map((r) => r.trim())
      .filter(Boolean);
  }
  let preview = '';
  if (rule !== -1) {
    preview = body
      .slice(rule)
      .replace(/^\s*_{8,}\s*/, '')
      .replace(/^A preview of the message is below\.[^\n]*\n?/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return { recipients, preview: preview.slice(0, 300) };
}

/** List entry for a request */
export function toApproval(
  request: GraphApprovalRequest,
  inboxFolderId: string | undefined,
  now: Date = new Date()
): EmailApproval {
  const { recipients, preview } = parseRequestBody(request.body?.content);
  return {
    id: request.id,
    subject: heldSubject(request.subject),
    requestedAt: request.receivedDateTime,
    expiresAt: new Date(
      new Date(request.receivedDateTime).getTime() + REQUEST_LIFETIME_MS
    ).toISOString(),
    status: approvalStatus(request, inboxFolderId, now),
    recipients,
    preview,
  };
}

/** Pending first (oldest first, as they expire first), then the rest newest first */
export function sortApprovals(items: EmailApproval[]): EmailApproval[] {
  const pending = items
    .filter((i) => i.status === 'pending')
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  const rest = items
    .filter((i) => i.status !== 'pending')
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  return [...pending, ...rest];
}

export interface ParsedDecision {
  decision: ApprovalDecision;
  reason?: string;
}

/** Body of POST …/approvals/[mid]: { decision: "approve" | "reject", reason? }; a reject needs a reason. */
export function parseDecisionRequest(raw: unknown): ParsedDecision | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Body must be a JSON object' };
  }
  const extra = Object.keys(raw).find((k) => k !== 'decision' && k !== 'reason');
  if (extra) return { error: `Unknown field: ${extra}` };
  const { decision, reason } = raw as Record<string, unknown>;
  if (decision !== 'approve' && decision !== 'reject') {
    return { error: 'decision must be "approve" or "reject"' };
  }
  if (reason !== undefined && typeof reason !== 'string') {
    return { error: 'reason must be a string' };
  }
  const text = (reason ?? '').trim();
  if (decision === 'reject' && !text) return { error: 'A rejection needs a reason' };
  if (text.length > MAX_REASON_LENGTH) {
    return { error: `reason must be at most ${MAX_REASON_LENGTH} characters` };
  }
  return text ? { decision, reason: text } : { decision };
}

/**
 * The reply message Exchange treats as a moderator's vote. `arbitration` is
 * the request's Reply-To (Graph's createReply addresses the agent instead);
 * the report tag is copied from the request.
 */
export function decisionMessage(
  decision: ApprovalDecision,
  subject: string,
  arbitration: { name?: string; address: string },
  reportTag: string,
  reason?: string
) {
  return {
    subject: `${VERB[decision]}: ${subject}`,
    body: { contentType: 'text', content: reason ?? '' },
    toRecipients: [{ emailAddress: arbitration }],
    singleValueExtendedProperties: [
      { id: MESSAGE_CLASS_PROP, value: REPLY_CLASS[decision] },
      { id: VERB_RESPONSE_PROP, value: VERB[decision] },
      { id: REPORT_TAG_PROP, value: reportTag },
    ],
  };
}

/** Marks the request with the decision, as Outlook's voting buttons do, so the list shows it */
export function decisionMarker(decision: ApprovalDecision) {
  return { singleValueExtendedProperties: [{ id: VERB_RESPONSE_PROP, value: VERB[decision] }] };
}

/** The arbitration mailbox a decision goes to: a SystemMailbox in the request's Reply-To */
export function arbitrationAddress(
  request: GraphApprovalRequest
): { name?: string; address: string } | null {
  const reply = request.replyTo?.find((r) => r.emailAddress?.address);
  const address = reply?.emailAddress?.address;
  if (!address || !/^SystemMailbox\{[0-9a-f-]+\}@/i.test(address)) return null;
  return { name: reply?.emailAddress?.name ?? undefined, address };
}

export function reportTag(request: GraphApprovalRequest): string | undefined {
  return prop(request, REPORT_TAG_PROP);
}

/**
 * Every address the agent's mail can come from: its primary SMTP address and
 * smtp aliases from the directory, and its UPN (which can differ from both).
 * Lower-cased, primary first, de-duplicated, capped to keep the filter small.
 */
export function senderAddresses(
  upn: string,
  user?: { mail?: string | null; proxyAddresses?: string[] | null }
): string[] {
  const aliases = (user?.proxyAddresses ?? [])
    .filter((p) => /^smtp:/i.test(p))
    // SMTP: (upper case) marks the primary address
    .sort((a, b) => Number(b.startsWith('SMTP:')) - Number(a.startsWith('SMTP:')))
    .map((p) => p.slice(5));
  const all = [user?.mail, ...aliases, upn]
    .filter((a): a is string => Boolean(a))
    .map((a) => a.toLowerCase());
  return [...new Set(all)].slice(0, 10);
}

export function isApprovalRequest(request: GraphApprovalRequest): boolean {
  return prop(request, MESSAGE_CLASS_PROP) === REQUEST_CLASS;
}
