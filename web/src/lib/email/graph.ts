import 'server-only';
// Approvals: copied from knowall-ai/agents-portal src/lib/providers/approvals.ts @ d0f5af6
// (PR #143), in step with knowall-ai/sallie web/src/lib/approvals*.ts (origin/main, sallie#217). Mailbox reads below are Bookie's (shared with knowall-ai/sallie).
// Microsoft Graph: Exchange moderation requests in the signed-in moderator's
// own mailbox (/me), and the decisions sent back. The token is the user's
// delegated Mail.ReadWrite + Mail.Send, so the portal can only ever see and
// answer requests addressed to the person using it.
import { createHash } from 'node:crypto';
import {
  HISTORY_DAYS,
  REQUEST_PROPS_EXPAND,
  approvalStatus,
  senderAddresses,
  arbitrationAddress,
  decisionMarker,
  decisionMessage,
  heldSubject,
  isApprovalRequest,
  reportTag,
  requestFilter,
  sortApprovals,
  toApproval,
  LAST_VERB_PROP,
  MESSAGE_CLASS_PROP,
  REPORT_TAG_PROP,
  VERB_RESPONSE_PROP,
  type GraphApprovalRequest,
} from './approvals';
import {
  MAILBOX_FOLDERS,
  MAILBOX_PAGE_SIZE,
  MESSAGE_SELECT,
  childFolderFilter,
  folderSegments,
  isNoAccess,
  toMailboxMessage,
  type GraphMessage,
} from './mailbox';
import type {
  ApprovalDecision,
  EmailAddress,
  EmailApproval,
  EmailApprovalDetail,
  MailboxFolderKey,
  MailboxFolderView,
} from './types';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const PAGE_SIZE = 50;
const MARKER_ATTEMPTS = 3;
/** Exported for tests, which do not wait */
export const MARKER_RETRY = { ms: 500 };
/** Two weeks of one agent's held email is far below this; past it the list says it is incomplete */
const MAX_PAGES = 10;

/** A Graph failure with a fixed label: paths carry the agent's address, which must not reach logs or responses. */
export class ApprovalGraphError extends Error {
  constructor(
    readonly status: number,
    label: string
  ) {
    super(`Graph ${status} ${label}`);
    this.name = 'ApprovalGraphError';
  }
}

async function graph<T>(
  token: string,
  path: string,
  label: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const send = () =>
    fetch(path.startsWith('https://') ? path : `${GRAPH}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  let response = await send();
  // Throttled or briefly unavailable: wait as Graph asks (capped) and try once more.
  // Never for a send: a vote must not go twice.
  if ((response.status === 429 || response.status === 503) && !path.endsWith('/send')) {
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response)));
    response = await send();
  }
  if (!response.ok) throw new ApprovalGraphError(response.status, label);
  if (response.status === 202 || response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Graph's Retry-After (seconds), capped so a request never hangs: 1 s if absent */
function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After'));
  return Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds : 1, 5) * 1000;
}

/** Plain-text bodies: the request's text names the recipients and quotes the email */
const TEXT_BODY = { Prefer: 'outlook.body-content-type="text"' };

/** Deleted Items: a request deleted there was dealt with (see approvalStatus) */
async function deletedItemsId(token: string): Promise<string> {
  const folder = await graph<{ id?: string }>(
    token,
    '/me/mailFolders/deleteditems?$select=id',
    'deleted items lookup'
  );
  if (!folder.id) throw new ApprovalGraphError(502, 'deleted items lookup');
  return folder.id;
}

/** For reads, a failed Deleted Items lookup only loses the deleted-request hint */
const deletedItemsIdIfAny = (token: string) => deletedItemsId(token).catch(() => undefined);

export interface ApprovalList {
  items: EmailApproval[];
  /** More requests matched than MAX_PAGES pages hold */
  incomplete: boolean;
}

/** Requests from any of `senders` in the last HISTORY_DAYS, every page, pending first. */
export async function listApprovals(
  token: string,
  senders: string[],
  now: Date = new Date(),
  agentIds: ReadonlyMap<string, string> = new Map()
): Promise<ApprovalList> {
  const since = new Date(now.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    $filter: requestFilter(senders, since),
    $select: 'id,subject,from,receivedDateTime,parentFolderId,body',
    $expand: REQUEST_PROPS_EXPAND,
    $top: String(PAGE_SIZE),
  });
  const deleted = deletedItemsIdIfAny(token);
  const requests: GraphApprovalRequest[] = [];
  let next: string | undefined = `/me/messages?${query.toString()}`;
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const result: { value: GraphApprovalRequest[]; '@odata.nextLink'?: string } = await graph(
      token,
      next,
      'approval list',
      { headers: TEXT_BODY }
    );
    requests.push(...result.value);
    next = result['@odata.nextLink'];
  }
  const folder = await deleted;
  return {
    items: sortApprovals(
      requests.map((r) => ({
        ...toApproval(r, folder, now),
        agentId: agentIds.get(r.from?.emailAddress?.address?.trim().toLowerCase() ?? ''),
      }))
    ),
    incomplete: Boolean(next),
  };
}

const DETAIL_PROPS = [MESSAGE_CLASS_PROP, LAST_VERB_PROP, VERB_RESPONSE_PROP, REPORT_TAG_PROP]
  .map((id) => `id eq '${id}'`)
  .join(' or ');

/** The request, checked to be a moderation request from one of `senders`; null otherwise. */
async function getRequest(
  token: string,
  messageId: string,
  senders: string[]
): Promise<GraphApprovalRequest | null> {
  const query = new URLSearchParams({
    $select: 'id,subject,receivedDateTime,parentFolderId,from,replyTo,body',
    $expand: `singleValueExtendedProperties($filter=${DETAIL_PROPS})`,
  });
  let request: GraphApprovalRequest;
  try {
    request = await graph<GraphApprovalRequest>(
      token,
      `/me/messages/${encodeURIComponent(messageId)}?${query.toString()}`,
      'approval lookup',
      { headers: TEXT_BODY }
    );
  } catch (error) {
    // Graph answers 400 for a malformed id and 404 for one that is not in this mailbox
    if (error instanceof ApprovalGraphError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  }
  const from = request.from?.emailAddress?.address?.toLowerCase();
  if (!isApprovalRequest(request) || !from || !senders.includes(from)) return null;
  return request;
}

interface HeldItem {
  subject?: string | null;
  from?: { emailAddress?: EmailAddress } | null;
  toRecipients?: { emailAddress?: EmailAddress }[];
  ccRecipients?: { emailAddress?: EmailAddress }[];
  body?: { contentType?: string; content?: string | null } | null;
  hasAttachments?: boolean;
}

const addresses = (list?: { emailAddress?: EmailAddress }[]): EmailAddress[] =>
  (list ?? [])
    .map((r) => r.emailAddress)
    .filter((e): e is EmailAddress => Boolean(e?.address))
    .map((e) => ({ ...(e.name ? { name: e.name } : {}), address: e.address }));

/** The held email, read from the request's item attachment; null when the id is not this agent's request. */
export async function getApprovalDetail(
  token: string,
  messageId: string,
  senders: string[],
  now: Date = new Date(),
  agentIds: ReadonlyMap<string, string> = new Map()
): Promise<EmailApprovalDetail | null> {
  const request = await getRequest(token, messageId, senders);
  if (!request) return null;
  const [deleted, attachments] = await Promise.all([
    deletedItemsIdIfAny(token),
    graph<{ value: { '@odata.type'?: string; item?: HeldItem }[] }>(
      token,
      `/me/messages/${encodeURIComponent(messageId)}/attachments?$expand=microsoft.graph.itemattachment/item`,
      'held email lookup'
    ),
  ]);
  const held = attachments.value.find(
    (a) => a['@odata.type'] === '#microsoft.graph.itemAttachment' && a.item
  )?.item;
  const summary = toApproval(request, deleted, now);
  return {
    ...summary,
    agentId:
      agentIds.get(request.from?.emailAddress?.address?.trim().toLowerCase() ?? '') ??
      agentIds.get(held?.from?.emailAddress?.address?.trim().toLowerCase() ?? ''),
    subject: held?.subject ? held.subject : summary.subject,
    ...(held?.from?.emailAddress?.address ? { from: addresses([held.from])[0] } : {}),
    to: addresses(held?.toRecipients),
    cc: addresses(held?.ccRecipients),
    bodyType: held?.body?.contentType === 'html' ? 'html' : 'text',
    body: held?.body?.content ?? summary.preview,
    hasAttachments: Boolean(held?.hasAttachments),
  };
}

/**
 * Decisions in flight, per moderator token and request: a second decision on
 * the same request waits for the first and then finds it no longer pending.
 * Exchange itself accepts only the first vote it processes, so this only has
 * to stop one server process sending two contradictory votes and markers.
 */
const inFlight = new Map<string, Promise<unknown>>();

async function serialised<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = inFlight.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(run);
  inFlight.set(key, current);
  try {
    return await current;
  } finally {
    if (inFlight.get(key) === current) inFlight.delete(key);
  }
}

/** The agent's sending addresses from the directory (needs User.Read.All); the UPN alone if that fails */
export async function resolveSenders(
  directoryToken: string | null,
  upn: string
): Promise<string[]> {
  if (!directoryToken) return senderAddresses(upn);
  try {
    const user = await graph<{ mail?: string | null; proxyAddresses?: string[] | null }>(
      directoryToken,
      `/users/${encodeURIComponent(upn)}?$select=mail,proxyAddresses`,
      'sender lookup'
    );
    return senderAddresses(upn, user);
  } catch (error) {
    console.warn(
      'Could not read the agent account addresses:',
      error instanceof Error ? error.name : 'failed'
    );
    return senderAddresses(upn);
  }
}

export type DecideResult =
  | { ok: true; status: 'approved' | 'rejected' }
  | { ok: false; reason: 'not-found' | 'not-pending' | 'unanswerable' };

/**
 * Send the moderator's decision to Exchange: a reply to the request carrying
 * the vote and the request's report tag, addressed to the arbitration mailbox.
 * Then mark the request with the decision so the list shows it at once
 * (Exchange keeps no state on it). Only a still-pending request is answered.
 */
export async function decideApproval(
  token: string,
  messageId: string,
  senders: string[],
  decision: ApprovalDecision,
  reason?: string,
  now: Date = new Date()
): Promise<DecideResult> {
  const moderator = createHash('sha256').update(token).digest('hex');
  return serialised(`${moderator}:${messageId}`, () =>
    sendDecision(token, messageId, senders, decision, reason, now)
  );
}

async function sendDecision(
  token: string,
  messageId: string,
  senders: string[],
  decision: ApprovalDecision,
  reason: string | undefined,
  now: Date
): Promise<DecideResult> {
  // Both reads must succeed: an unverified folder could hide a request already dealt with
  const [request, deleted] = await Promise.all([
    getRequest(token, messageId, senders),
    deletedItemsId(token),
  ]);
  if (!request) return { ok: false, reason: 'not-found' };
  if (approvalStatus(request, deleted, now) !== 'pending') {
    return { ok: false, reason: 'not-pending' };
  }
  const arbitration = arbitrationAddress(request, senders);
  const tag = reportTag(request);
  if (!arbitration || !tag) return { ok: false, reason: 'unanswerable' };

  const id = encodeURIComponent(messageId);
  const draft = await graph<{ id: string }>(
    token,
    `/me/messages/${id}/createReply`,
    'decision draft',
    {
      method: 'POST',
      body: {
        message: decisionMessage(decision, heldSubject(request.subject), arbitration, tag, reason),
      },
    }
  );
  try {
    await graph(token, `/me/messages/${encodeURIComponent(draft.id)}/send`, 'decision send', {
      method: 'POST',
    });
  } catch (error) {
    // never leave a half-made vote in Drafts for someone to send by hand later
    await graph(token, `/me/messages/${encodeURIComponent(draft.id)}`, 'draft cleanup', {
      method: 'DELETE',
    }).catch(() => undefined);
    throw error;
  }
  // The vote is sent and must never be sent again, so only the marker is retried.
  // Should every attempt fail, the request still is not pending: sending the reply
  // set its last verb (102), which approvalStatus reads as handled elsewhere.
  for (let attempt = 1; attempt <= MARKER_ATTEMPTS; attempt++) {
    try {
      await graph(token, `/me/messages/${id}`, 'decision marker', {
        method: 'PATCH',
        body: { ...decisionMarker(decision), isRead: true },
      });
      break;
    } catch (error) {
      if (attempt === MARKER_ATTEMPTS) {
        console.warn(
          'Could not mark the approval request:',
          error instanceof Error ? error.name : 'failed'
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, MARKER_RETRY.ms * attempt));
      }
    }
  }
  return { ok: true, status: decision === 'approve' ? 'approved' : 'rejected' };
}

/* ------------------------------------------------------------------ */
/* The accounts mailbox (a shared mailbox), read as the signed-in person */
/* ------------------------------------------------------------------ */

type MailboxFolder = { key: MailboxFolderKey; label: string; path: string };

/** A failed mailbox read: status and Graph's error code only (paths carry the mailbox address). */
export { MailboxGraphError } from './errors';
import { MailboxGraphError } from './errors';
import type { MailMessage, MailFile, MailAttachmentMeta } from './types';
import { canReadShared, tokenScopes } from './mailbox';

async function mailboxResponse(token: string, path: string, label: string): Promise<Response> {
  const send = () =>
    fetch(`${GRAPH}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  let response = await send();
  if (response.status === 429 || response.status === 503) {
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response)));
    response = await send();
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { code?: string } };
    throw new MailboxGraphError(response.status, body.error?.code, label);
  }
  return response;
}
async function mailboxGraph<T>(token: string, path: string, label: string): Promise<T> {
  return (await mailboxResponse(token, path, label)).json() as Promise<T>;
}

/** A folder's id under the mailbox's Inbox, found name by name; null when it doesn't exist. */
async function folderId(token: string, mailbox: string, path: string): Promise<string | null> {
  let parent = 'inbox';
  for (const name of folderSegments(path)) {
    const query = new URLSearchParams({ $filter: childFolderFilter(name), $select: 'id' });
    const found = await mailboxGraph<{ value: { id: string }[] }>(
      token,
      `/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(parent)}/childFolders?${query.toString()}`,
      'mailbox folder lookup'
    );
    const id = found.value[0]?.id;
    if (!id) return null;
    parent = id;
  }
  return parent;
}

async function readFolder(
  token: string,
  mailbox: string,
  folder: MailboxFolder
): Promise<MailboxFolderView> {
  const id = await folderId(token, mailbox, folder.path);
  if (!id) return { ...folder, missing: true, messages: [] };
  const query = new URLSearchParams({
    $select: MESSAGE_SELECT,
    $orderby: 'receivedDateTime desc',
    $top: String(MAILBOX_PAGE_SIZE),
  });
  const result = await mailboxGraph<{ value: GraphMessage[]; '@odata.nextLink'?: string }>(
    token,
    `/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(id)}/messages?${query.toString()}`,
    'mailbox messages'
  );
  return {
    ...folder,
    messages: result.value.flatMap((m) => toMailboxMessage(m) ?? []),
    ...(result['@odata.nextLink'] ? { more: true } : {}),
  };
}

export type MailboxRead =
  { ok: true; folders: MailboxFolderView[] } | { ok: false; reason: 'no-access' };

/**
 * The Inbox and bill capture's folders of `mailbox`, newest first. Exchange
 * decides who may read it: a 403 or 404 means this person can't read that folder.
 */
export async function readMailbox(
  token: string,
  mailbox: string,
  folders: MailboxFolder[] = MAILBOX_FOLDERS
): Promise<MailboxRead> {
  // Each folder on its own: access can be granted per folder, so one refusal hides only that folder.
  const views = await Promise.all(
    folders.map((f) =>
      readFolder(token, mailbox, f).catch((error: unknown) => {
        if (error instanceof MailboxGraphError && isNoAccess(error.status, error.code)) {
          return { ...f, noAccess: true, messages: [] } satisfies MailboxFolderView;
        }
        throw error;
      })
    )
  );
  // No folder readable at all: the person has no access to the mailbox.
  if (views.every((v) => v.noAccess)) return { ok: false, reason: 'no-access' };
  return { ok: true, folders: views };
}

/** Has this mailbox ever received a moderation request from Bookie? */
export async function isApprover(token: string, senders: string[]): Promise<boolean> {
  const query = new URLSearchParams({
    $filter: requestFilter(senders, new Date(0)),
    $top: '1',
    $select: 'id',
  });
  const result = await graph<{ value: { id: string }[] }>(
    token,
    `/me/messages?${query}`,
    'approver lookup'
  );
  return result.value.length > 0;
}

/** Invoice checks use the same mailbox permissions, folders, retries and timeouts as Email. */
export class GraphMailbox {
  constructor(
    readonly mailbox: string,
    private readonly token: () => Promise<string>
  ) {}
  private get base() {
    return `/users/${encodeURIComponent(this.mailbox)}`;
  }
  private async accessToken() {
    const token = await this.token();
    if (!canReadShared(tokenScopes(token)))
      throw new MailboxGraphError(403, undefined, 'Shared mail consent required');
    return token;
  }
  async message(id: string): Promise<MailMessage> {
    const token = await this.accessToken();
    const path = `${this.base}/messages/${encodeURIComponent(id)}`;
    const message = await mailboxGraph<MailMessage>(
      token,
      `${path}?$select=id,subject,receivedDateTime,from,sender,replyTo,internetMessageHeaders,parentFolderId`,
      'mailbox message'
    );
    const allowed = await Promise.all(
      MAILBOX_FOLDERS.map(async (folder) => {
        try {
          if (!folder.path)
            return (
              await mailboxGraph<{ id: string }>(
                token,
                `${this.base}/mailFolders/inbox?$select=id`,
                'mailbox inbox lookup'
              )
            ).id;
          return await folderId(token, this.mailbox, folder.path);
        } catch (error) {
          if (error instanceof MailboxGraphError && isNoAccess(error.status, error.code))
            return null;
          throw error;
        }
      })
    );
    if (!message.parentFolderId || !allowed.includes(message.parentFolderId))
      throw new MailboxGraphError(
        403,
        'OutsideAccountsInbox',
        'This message is not in the accounts inbox.'
      );
    const attachments: MailAttachmentMeta[] = [];
    let next: string | undefined = `${path}/attachments?$select=id,name,contentType,size,isInline`;
    while (next) {
      const page: { value: MailAttachmentMeta[]; '@odata.nextLink'?: string } = await mailboxGraph(
        token,
        next,
        'mailbox attachments'
      );
      attachments.push(...page.value);
      next = page['@odata.nextLink'];
      if (next) {
        if (!next.startsWith(`${GRAPH}${path}/attachments?`))
          throw new MailboxGraphError(502, undefined, 'Invalid attachment page');
        next = next.slice(GRAPH.length);
      }
    }
    return { ...message, attachments };
  }
  async attachment(messageId: string, attachmentId: string): Promise<MailFile> {
    const message = await this.message(messageId);
    const meta = message.attachments.find((a) => a.id === attachmentId);
    if (!meta) throw new MailboxGraphError(404, undefined, 'Attachment not found');
    const response = await mailboxResponse(
      await this.accessToken(),
      `${this.base}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`,
      'mailbox attachment'
    );
    return {
      fileName: meta.name,
      contentType: meta.contentType,
      bytes: await response.arrayBuffer(),
    };
  }
}
