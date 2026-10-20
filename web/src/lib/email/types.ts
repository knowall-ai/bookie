/**
 * Bookie's emails: the external emails Exchange holds for a moderator's approval,
 * and the accounts mailbox bill capture reads. Everything is read live from
 * Microsoft 365 as the signed-in person; Bookie stores none of it.
 *
 * The approval types match knowall-ai/agents-portal (src/types) so `approvals.ts`
 * can be copied between the two unchanged.
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'decided' | 'expired';

export type ApprovalDecision = 'approve' | 'reject';

export interface EmailAddress {
  name?: string;
  address: string;
}

/** One of Bookie's outgoing emails that Exchange held for the signed-in moderator. */
export interface EmailApproval {
  /** Graph id of the moderation request in the moderator's mailbox */
  id: string;
  /** The held email's subject (the request's "Approval requested:" prefix removed) */
  subject: string;
  /** When Exchange asked for a decision */
  requestedAt: string;
  /** Exchange drops an undecided request after two days */
  expiresAt: string;
  status: ApprovalStatus;
  /** The held recipients as Exchange names them in the request (display names, not addresses) */
  recipients: string[];
  preview: string;
}

/** The held email itself, from the request's attachment */
export interface EmailApprovalDetail extends EmailApproval {
  from?: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bodyType: 'html' | 'text';
  body: string;
  /** The held email carries attachments (open it in Outlook to see them) */
  hasAttachments: boolean;
}

/** The Awaiting approval tab. */
export type ApprovalsView =
  /** Settings has no address for Bookie's mailbox. */
  | { status: 'not-configured' }
  /** The tenant hasn't consented Mail.ReadWrite and Mail.Send for Bookie. */
  | { status: 'no-consent' }
  | { status: 'ok'; items: EmailApproval[]; incomplete?: boolean }
  | { status: 'error'; error: string };

/** A message in the accounts mailbox, as the list shows it. */
export interface MailboxMessage {
  id: string;
  subject: string;
  from?: EmailAddress;
  receivedAt: string;
  preview: string;
  hasAttachments: boolean;
  isRead: boolean;
  /** Opens the message in Outlook on the web. */
  webLink?: string;
}

export type MailboxFolderKey = 'inbox' | 'needs-review' | 'captured';

export interface MailboxFolderView {
  key: MailboxFolderKey;
  label: string;
  /** Where the folder is, under the mailbox's Inbox ('' for the Inbox itself). */
  path: string;
  /** The folder doesn't exist in the mailbox (bill capture's folders are made by a person). */
  missing?: boolean;
  /** Exchange won't let the person read this folder (the rest of the mailbox may still show). */
  noAccess?: boolean;
  messages: MailboxMessage[];
  /** More messages than the list shows. */
  more?: boolean;
}

/** The accounts mailbox tabs. */
export type MailboxView =
  | { status: 'not-configured' }
  /** The tenant hasn't consented Mail.Read.Shared for Bookie. */
  | { status: 'no-consent'; mailbox: string }
  /** Exchange won't let the signed-in person read the mailbox. */
  | { status: 'no-access'; mailbox: string }
  | { status: 'ok'; mailbox: string; folders: MailboxFolderView[] }
  | { status: 'error'; mailbox: string; error: string };

export interface EmailsOverview {
  /** Bookie's own address, as set in Settings. */
  agentAddress?: string;
  approvals: ApprovalsView;
  mailbox: MailboxView;
  /** Sample data (the demo organisation). */
  demo?: boolean;
}
