/**
 * Bookie's emails: the external emails Exchange holds for a moderator's approval,
 * and the shared mailboxes he reads. Everything is read live from
 * Microsoft 365 as the signed-in person; Bookie stores none of it.
 *
 * The approval types match knowall-ai/agents-portal (src/types) so `approvals.ts`
 * can be copied between the two unchanged.
 */

/** Shared with knowall-ai/sallie: an agent with its own sending mailbox. */
export interface MailAgent {
  id: string;
  displayName: string;
  mailbox: string;
  teamsUser?: string;
}

/** Shared with knowall-ai/sallie: a mailbox an agent reads. */
export interface SharedMailbox {
  address: string;
  label?: string;
  /** The agent that triages it. */
  agentId?: string;
  /** Bookie only: bill capture files into this one. */
  capture?: true;
}

/** Shared with knowall-ai/sallie, which stores this shape in Business Central. */
export interface AgentMailSetup {
  agents: MailAgent[];
  sharedMailboxes: SharedMailbox[];
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'decided' | 'expired';

export type ApprovalDecision = 'approve' | 'reject';

export interface EmailAddress {
  name?: string;
  address: string;
}

/** One of Bookie's outgoing emails that Exchange held for the signed-in moderator. */
export interface EmailApproval {
  agentId?: string;
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
  | { status: 'ok'; isApprover: boolean; items: EmailApproval[]; incomplete?: boolean }
  | { status: 'error'; error: string };

/** A message in a shared mailbox, as the list shows it. */
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

/** A shared mailbox and its independently loaded state. */
export type MailboxView = { mailbox: string; label?: string; agentId?: string; capture?: true } & (
  | { status: 'no-consent' }
  | { status: 'no-access' }
  | { status: 'ok'; folders: MailboxFolderView[] }
  | { status: 'error'; error: string }
);

export interface EmailsOverview {
  /** Agents configured in Settings. */
  agents: MailAgent[];
  approvals: ApprovalsView;
  mailboxes: MailboxView[];
  /** Sample data (the demo organisation). */
  demo?: boolean;
}

/**
 * One "<Agent> suggests" item on an opened inbox email, shared with knowall-ai/sallie so the
 * panel looks and works the same in both portals. Filled from the agent's own record of the
 * email (Bookie: invoice checks; Sallie: a suggested reply), keyed by the message's
 * internetMessageId. No record yet means "<Agent> hasn't looked at this one yet".
 */
export interface AgentSuggestion {
  /** The email's internetMessageId. */
  messageId: string;
  title: string;
  /** Why the agent suggests it, in plain words. */
  why: string;
  actions: AgentSuggestionAction[];
}

export interface AgentSuggestionAction {
  /** Stable per action, e.g. "file-bill", "send-reply", "dismiss". */
  kind: string;
  label: string;
  /** Writes are confirmed in a ConfirmDialog before they run. */
  confirm?: { title: string; body: string; cta: string };
}
