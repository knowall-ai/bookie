import { notFound } from 'next/navigation';
import { AccountsInboxItemPage } from '@/components/accounts-inbox/AccountsInboxItemPage';
import { accountsMailbox, documentsOf } from '@/lib/accounts-inbox/review';
import { requireAuth } from '@/lib/auth/context';
import { orgContext } from '@/lib/portal/context';
import { ErrorPanel, EmptyState } from '@/components/ui/States';
import { MailboxGraphError } from '@/lib/email/errors';
export const metadata = { title: 'Bookie suggests' };
export default async function CheckMessage({
  params,
}: {
  params: Promise<{ org: string; messageId: string }>;
}) {
  const { org, messageId } = await params;
  await orgContext(org);
  const auth = await requireAuth(`/portal/${org}/email`);
  const setup = await accountsMailbox(auth);
  if (!setup.ok) notFound();
  const result = await setup.reader
    .message(messageId)
    .then((message) => ({ message }))
    .catch((error: unknown) => {
      if (error instanceof MailboxGraphError) return { error: error.message };
      throw error;
    });
  if ('error' in result)
    return <ErrorPanel title="Couldn't check this email" message={result.error} />;
  const message = result.message;
  const docs = documentsOf(message);
  if (!docs.length)
    return (
      <EmptyState
        title="No invoice attachments"
        body="This email has no PDF or image documents to check."
      />
    );
  return (
    <div className="space-y-8">
      {docs.map((doc) => (
        <section key={doc.id}>
          <AccountsInboxItemPage orgParam={org} messageId={messageId} attachmentId={doc.id} />
        </section>
      ))}
    </div>
  );
}
