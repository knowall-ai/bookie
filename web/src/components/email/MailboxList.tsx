import Link from 'next/link';
import { ExternalLink, FolderX, Inbox, Paperclip, UserLock } from 'lucide-react';
import { EmptyState } from '@/components/ui/States';
import type { MailboxFolderView } from '@/lib/email/types';
import { formatDateTimeUk } from '@/lib/ui/format';

const EMPTY: Record<MailboxFolderView['key'], string> = {
  inbox: 'Nothing waiting in this mailbox.',
  'needs-review':
    'Nothing needs review. Emails that could not be captured confidently are filed here, with the reason in the capture log.',
  captured: 'No captured invoices yet. Each is filed here once its draft bill is made.',
};

/** One folder of the accounts mailbox, newest first. Read-only: it opens in Outlook. */
export function MailboxList({
  folder,
  mailbox,
  checkBase,
}: {
  folder: MailboxFolderView;
  mailbox: string;
  checkBase?: string;
}) {
  if (folder.noAccess) {
    return (
      <EmptyState
        icon={<UserLock className="h-6 w-6" />}
        title={`You don’t have access to this folder in ${mailbox}`}
        body="Exchange decides who can open it. Ask your Microsoft 365 administrator if you need it."
      />
    );
  }
  if (folder.missing) {
    return (
      <EmptyState
        icon={<FolderX className="h-6 w-6" />}
        title={`There’s no “${folder.path}” folder in ${mailbox}`}
        body="Bill capture files emails into folders a person creates once under the mailbox’s Inbox (agent deploy step 10). Until it exists, emails remain in the Inbox."
      />
    );
  }
  if (folder.messages.length === 0) {
    return (
      <EmptyState icon={<Inbox className="h-6 w-6" />} title="No emails" body={EMPTY[folder.key]} />
    );
  }
  return (
    <div className="space-y-3">
      <ul className="card divide-line divide-y" aria-label={folder.label}>
        {folder.messages.map((m) => (
          <li key={m.id} className="flex items-start gap-3 p-4" data-testid="mailbox-message">
            <span
              className={`mt-2 h-2 w-2 shrink-0 rounded-full ${m.isRead ? 'bg-transparent' : 'bg-brand'}`}
              aria-label={m.isRead ? undefined : 'Unread'}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p
                  className={`truncate text-sm ${m.isRead ? 'text-body' : 'text-ink font-semibold'}`}
                >
                  {m.from ? (m.from.name ?? m.from.address) : 'Sender not shown'}
                </p>
                <time
                  dateTime={m.receivedAt}
                  className="text-muted shrink-0 text-xs"
                  title={formatDateTimeUk(m.receivedAt, true)}
                >
                  {formatDateTimeUk(m.receivedAt)}
                </time>
              </div>
              <p className="text-ink mt-0.5 flex items-center gap-1.5 truncate text-sm">
                {m.hasAttachments && (
                  <Paperclip
                    className="text-muted h-3.5 w-3.5 shrink-0"
                    aria-label="Has attachments"
                  />
                )}
                <span className="truncate">{m.subject}</span>
              </p>
              {m.preview && <p className="text-muted mt-1 line-clamp-1 text-sm">{m.preview}</p>}
            </div>
            {checkBase &&
              m.hasAttachments &&
              (folder.key === 'inbox' || folder.key === 'needs-review') && (
                <Link
                  className="text-brand-bright text-sm hover:underline"
                  href={`${checkBase}/check/${encodeURIComponent(m.id)}`}
                >
                  Bookie suggests
                </Link>
              )}
            {m.webLink && (
              <a
                href={m.webLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-bright inline-flex shrink-0 items-center gap-1 text-sm hover:underline"
              >
                Open <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">in Outlook (new tab)</span>
              </a>
            )}
          </li>
        ))}
      </ul>
      {folder.more && (
        <p className="text-muted text-sm">
          Showing the newest {folder.messages.length}. Open the mailbox in Outlook to see the rest.
        </p>
      )}
    </div>
  );
}
