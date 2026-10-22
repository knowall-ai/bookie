import type { EmailSettings } from '@/lib/config/types';
import type { SharedMailbox } from './types';
// Reading a shared mailbox (Bookie's accounts@) as the signed-in person: pure
// helpers, shared with knowall-ai/sallie (whose portal runs them in the browser),
// so no Node or server-only imports. Keep the two copies in step.
//
// Exchange decides who may read it: Graph answers 403 (or 404, which it also
// uses for a mailbox the caller can't see) unless the person has FullAccess.
// The portal shows that as "you don't have access", never as an error, and has
// no permission list of its own.
import type { EmailAddress, MailboxFolderKey, MailboxMessage } from './types';

/** The Inbox, then bill capture's folders under it (agent deploy step 10, BILL_CAPTURE_*_FOLDER). */
export const MAILBOX_FOLDERS: { key: MailboxFolderKey; label: string; path: string }[] = [
  { key: 'inbox', label: 'Inbox', path: '' },
  { key: 'needs-review', label: 'Needs review', path: 'Bookie/Needs review' },
  { key: 'captured', label: 'Captured', path: 'Bookie/Processed' },
];

/** Messages listed per folder, newest first. */
export const MAILBOX_PAGE_SIZE = 25;

export const MESSAGE_SELECT =
  'id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead,webLink';

/**
 * The inbox's tab label: its address as people see it in Outlook, "accounts@ inbox"
 * (agreed with knowall-ai/sallie, whose is "hello@ inbox"); "Inbox" without an address.
 */
export function inboxLabel(mailbox?: string): string {
  const local = mailbox?.split('@')[0]?.trim();
  return local ? `${local}@ inbox` : 'Inbox';
}

/** Folder names in a path under the Inbox: "Bookie/Needs review" → ["Bookie", "Needs review"]. */
export function folderSegments(path: string): string[] {
  return path
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Graph's $filter for a child folder by its display name. */
export function childFolderFilter(name: string): string {
  return `displayName eq '${name.replace(/'/g, "''")}'`;
}

/**
 * Graph errors that mean the person can't read the mailbox: 403, 404 (also used for a
 * mailbox they can't see), and 400 ErrorInvalidUser (the address isn't a mailbox, such
 * as a distribution list).
 */
export function isNoAccess(status: number, code?: string): boolean {
  return status === 403 || status === 404 || (status === 400 && code === 'ErrorInvalidUser');
}

export interface GraphMessage {
  id?: string | null;
  subject?: string | null;
  from?: { emailAddress?: { name?: string | null; address?: string | null } | null } | null;
  receivedDateTime?: string | null;
  bodyPreview?: string | null;
  hasAttachments?: boolean | null;
  isRead?: boolean | null;
  webLink?: string | null;
}

/** A Graph message as the list shows it, or `undefined` without an id or date. */
export function toMailboxMessage(message: GraphMessage): MailboxMessage | undefined {
  if (!message.id || !message.receivedDateTime) return undefined;
  const address = message.from?.emailAddress?.address?.trim();
  const name = message.from?.emailAddress?.name?.trim();
  const from: EmailAddress | undefined = address
    ? { ...(name && name !== address ? { name } : {}), address }
    : undefined;
  const webLink = message.webLink?.startsWith('https://') ? message.webLink : undefined;
  return {
    id: message.id,
    subject: message.subject?.trim() || '(no subject)',
    ...(from ? { from } : {}),
    receivedAt: message.receivedDateTime,
    preview: (message.bodyPreview ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
    hasAttachments: Boolean(message.hasAttachments),
    isRead: Boolean(message.isRead),
    ...(webLink ? { webLink } : {}),
  };
}

/**
 * The delegated scopes a Graph token carries (its `scp` claim), so the page can say
 * which consent is missing instead of failing. `null` when the token can't be read
 * (Microsoft treats access tokens as opaque): then Graph itself decides.
 */
export function tokenScopes(token: string): Set<string> | null {
  try {
    const payload = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))) as {
      scp?: unknown;
    };
    return typeof claims.scp === 'string' ? new Set(claims.scp.split(' ').filter(Boolean)) : null;
  } catch {
    return null;
  }
}

/** Approvals need to read and mark the request, and send the vote. */
export const APPROVAL_SCOPES = ['Mail.ReadWrite', 'Mail.Send'];

/** A shared mailbox needs .Shared (not Mail.ReadBasic.Shared: it leaves out the preview). Unknown scopes pass. */
export function canReadShared(scopes: Set<string> | null): boolean {
  return !scopes || scopes.has('Mail.Read.Shared') || scopes.has('Mail.ReadWrite.Shared');
}

/** Unknown scopes pass: Graph refuses if consent is missing. */
export function canModerate(scopes: Set<string> | null): boolean {
  return !scopes || APPROVAL_SCOPES.every((s) => scopes.has(s));
}

/** Resolve per-tenant settings, preserving legacy configuration on reads only. */
export function mailSetup(email?: EmailSettings): {
  agentMailbox?: string;
  sharedMailboxes: SharedMailbox[];
} {
  return {
    agentMailbox: email?.agentAddress,
    sharedMailboxes:
      email?.sharedMailboxes ??
      (email?.accountsMailbox ? [{ address: email.accountsMailbox, capture: true }] : []),
  };
}
