import { getAuthContext } from '@/lib/auth/context';
import { getConnector } from '@/lib/connectors/registry';
import { isConnectorError } from '@/lib/connectors/types';
import { fileHeaders } from '@/lib/portal/attachments-proxy';
import { accountsMailbox, documentsOf, messageTrust } from '@/lib/accounts-inbox/review';
import { isMailboxError } from '@/lib/mail/graph';

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
    const connector = await getConnector(auth, decodeURIComponent(org));
    const setup = await accountsMailbox(auth);
    if (!setup.ok) return json('No accounts mailbox is set up.', 404);
    const id = decodeURIComponent(messageId);
    const attId = decodeURIComponent(attachmentId);
    const { message, trust } = await messageTrust(auth, setup.reader, connector, id);
    if (trust.level === 'suspicious')
      return json('Bookie does not open attachments from suspicious emails.', 403);
    if (!documentsOf(message).some((d) => d.id === attId)) return json('Not found.', 404);
    const file = await setup.reader.attachment(id, attId);
    return new Response(file.bytes, { headers: fileHeaders(file, download) });
  } catch (error) {
    if (isMailboxError(error))
      return json(
        error.message,
        error.kind === 'forbidden' ? 403 : error.kind === 'not-found' ? 404 : 502
      );
    if (isConnectorError(error)) return json(error.message, error.status === 404 ? 404 : 502);
    return json('The document could not be loaded.', 500);
  }
}
