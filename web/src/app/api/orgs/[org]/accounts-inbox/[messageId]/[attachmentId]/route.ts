import { getAuthContext } from '@/lib/auth/context';
import { getConnector } from '@/lib/connectors/registry';
import { isConnectorError } from '@/lib/connectors/types';
import { fileHeaders } from '@/lib/portal/attachments-proxy';
import { accountsMailbox, reviewOne } from '@/lib/accounts-inbox/review';
import { MailboxGraphError } from '@/lib/email/errors';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };
const json = (error: string, status: number) =>
  Response.json({ error }, { status, headers: NO_STORE });

/**
 * Streams one PDF or image from the shared accounts mailbox, read live with the
 * signed-in user's own Microsoft 365 access. Attachments of suspicious emails are
 * never served. Nothing is cached.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string; messageId: string; attachmentId: string }> }
) {
  const { org, messageId, attachmentId } = await params;
  const download = new URL(request.url).searchParams.get('download') === '1';
  const auth = await getAuthContext();
  if (!auth) return json('Sign in required.', 401);
  try {
    // Re-checks the org against the user's own organisations.
    const connector = await getConnector(auth, org);
    const setup = await accountsMailbox(auth);
    if (!setup.ok) return json('No accounts mailbox is set up.', 404);
    const id = messageId;
    const attId = attachmentId;
    // The full verdict, so an email that is suspicious because of its bank details is refused too.
    const item = await reviewOne(auth, setup.reader, connector, id, attId);
    if (!item) return json('Not found.', 404);
    if (item.verdict.kind === 'suspicious')
      return json('Bookie does not open attachments from suspicious emails.', 403);
    const file = await setup.reader.attachment(id, attId);
    return new Response(file.bytes, { headers: fileHeaders(file, download) });
  } catch (error) {
    if (error instanceof MailboxGraphError)
      return json(error.message, error.status === 403 ? 403 : error.status === 404 ? 404 : 502);
    if (isConnectorError(error)) return json(error.message, error.status === 404 ? 404 : 502);
    return json('The document could not be loaded.', 500);
  }
}
