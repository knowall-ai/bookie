import type { MailHeaders } from './trust';

/**
 * Reading the shared accounts mailbox through Microsoft Graph with the signed-in
 * user's own delegated token (Mail.Read.Shared). Read only: nothing is moved,
 * flagged or marked as read, and nothing is stored.
 */

export interface MailAttachmentMeta {
  id: string;
  name: string;
  contentType: string;
  size?: number;
  isInline?: boolean;
}

export interface MailMessage extends MailHeaders {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  attachments: MailAttachmentMeta[];
}

export interface MailFile {
  fileName: string;
  contentType: string;
  bytes: ArrayBuffer;
}

export class MailboxError extends Error {
  constructor(
    message: string,
    readonly kind: 'forbidden' | 'not-found' | 'other',
    readonly status?: number
  ) {
    super(message);
    this.name = 'MailboxError';
  }
}

export function isMailboxError(error: unknown): error is MailboxError {
  return error instanceof Error && error.name === 'MailboxError';
}

const GRAPH = 'https://graph.microsoft.com/v1.0';
const MESSAGE_FIELDS =
  'id,subject,receivedDateTime,from,sender,replyTo,internetMessageHeaders,hasAttachments';
const ATTACHMENT_FIELDS = 'id,name,contentType,size,isInline';

type Fetch = typeof fetch;

/** A plain-English reason the mailbox can't be read. */
export function mailboxFailure(mailbox: string, status: number, code?: string): MailboxError {
  if (status === 403 || code === 'ErrorAccessDenied')
    return new MailboxError(
      `You don't have access to ${mailbox}. Ask your Microsoft 365 administrator to give you Read access to that mailbox (or Full Access), and make sure Bookie has been granted the Mail.Read.Shared permission.`,
      'forbidden',
      status
    );
  if (status === 404 || code === 'ErrorInvalidUser' || code === 'MailboxNotEnabledForRESTAPI')
    return new MailboxError(
      `Bookie couldn't find a mailbox called ${mailbox} that you can open. Check the address in Settings.`,
      'not-found',
      status
    );
  if (status === 401)
    return new MailboxError(
      'Your Microsoft sign-in has expired. Please sign in again.',
      'other',
      status
    );
  return new MailboxError(
    `Microsoft 365 didn't return ${mailbox}'s mail (${code ?? status}).`,
    'other',
    status
  );
}

export class GraphMailbox {
  constructor(
    readonly mailbox: string,
    private readonly token: () => Promise<string>,
    private readonly fetcher: Fetch = fetch
  ) {}

  private async get(url: string, raw = false): Promise<Response> {
    const response = await this.fetcher(url, {
      headers: { Authorization: `Bearer ${await this.token()}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = raw
        ? undefined
        : ((await response.json().catch(() => undefined)) as
            { error?: { code?: string } } | undefined);
      throw mailboxFailure(this.mailbox, response.status, body?.error?.code);
    }
    return response;
  }

  private get base() {
    return `${GRAPH}/users/${encodeURIComponent(this.mailbox)}/messages`;
  }

  /** Messages with attachments received since `since`, newest first, at most `max`. */
  async list(since: string, max: number): Promise<MailMessage[]> {
    const params = new URLSearchParams({
      $filter: `receivedDateTime ge ${since} and hasAttachments eq true`,
      $orderby: 'receivedDateTime desc',
      $select: MESSAGE_FIELDS,
      $expand: `attachments($select=${ATTACHMENT_FIELDS})`,
      $top: String(Math.min(max, 50)),
    });
    let url: string | undefined = `${this.base}?${params}`;
    const out: MailMessage[] = [];
    while (url && out.length < max) {
      const page = (await (await this.get(url)).json()) as {
        value?: MailMessage[];
        '@odata.nextLink'?: string;
      };
      for (const m of page.value ?? []) out.push({ ...m, attachments: m.attachments ?? [] });
      url = page['@odata.nextLink'];
    }
    return out.slice(0, max);
  }

  async message(id: string): Promise<MailMessage> {
    const params = new URLSearchParams({
      $select: MESSAGE_FIELDS,
      $expand: `attachments($select=${ATTACHMENT_FIELDS})`,
    });
    const m = (await (
      await this.get(`${this.base}/${encodeURIComponent(id)}?${params}`)
    ).json()) as MailMessage;
    return { ...m, attachments: m.attachments ?? [] };
  }

  /** The attachment's bytes (`$value`), with its name and type from the message. */
  async attachment(messageId: string, attachmentId: string): Promise<MailFile> {
    const message = await this.message(messageId);
    const meta = message.attachments.find((a) => a.id === attachmentId);
    if (!meta) throw new MailboxError('That attachment is no longer in the mailbox.', 'not-found');
    const response = await this.get(
      `${this.base}/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`,
      true
    );
    return {
      fileName: meta.name,
      contentType: meta.contentType,
      bytes: await response.arrayBuffer(),
    };
  }
}
