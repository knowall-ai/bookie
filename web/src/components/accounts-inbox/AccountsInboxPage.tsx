import Link from 'next/link';
import { FileImage, FileText, MailCheck, Mailbox, Settings } from 'lucide-react';
import { requireAuth } from '@/lib/auth/context';
import { canManageSettings } from '@/lib/auth/access';
import { orgContext } from '@/lib/portal/context';
import {
  accountsMailbox,
  DEFAULT_WEEKS,
  reviewMailbox,
  WEEK_CHOICES,
  type InboxItem,
} from '@/lib/accounts-inbox/review';
import { isMailboxError } from '@/lib/mail/graph';
import { isConnectorError } from '@/lib/connectors/types';
import { previewKind } from '@/lib/attachments';
import { formatDate } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorPanel } from '@/components/ui/States';
import { VerdictBadge, verdictDetail } from './verdict';

export function itemHref(base: string, item: Pick<InboxItem, 'messageId' | 'attachmentId'>) {
  return `${base}/purchases/accounts-inbox/${encodeURIComponent(item.messageId)}/${encodeURIComponent(item.attachmentId)}`;
}

/** Explains how to set the mailbox up (members) or who to ask (guests). */
export async function MailboxNotSet({ crumbs }: { crumbs: { label: string; href: string }[] }) {
  const auth = await requireAuth();
  const member = canManageSettings(auth.user);
  return (
    <>
      <PageHeader title="Accounts inbox" crumbs={crumbs} />
      <div data-testid="accounts-inbox-not-set">
        <EmptyState
          icon={<Mailbox className="h-6 w-6" />}
          title="No accounts mailbox set up yet"
          body={
            member
              ? 'Tell Bookie which shared mailbox your suppliers send bills to (for example accounts@yourcompany.com) in Settings › Accounts inbox. Bookie then reads it live, as you, and checks each invoice against your books. Each person needs access to that mailbox in Microsoft 365.'
              : 'An administrator in your organisation chooses the shared accounts mailbox in Settings › Accounts inbox. Ask them to set it up.'
          }
          action={
            member ? (
              <ButtonLink href="/portal/settings#accounts-inbox" variant="secondary">
                <Settings className="h-4 w-4" /> Open Settings
              </ButtonLink>
            ) : undefined
          }
        />
      </div>
    </>
  );
}

function summary(items: InboxItem[]): string {
  const count = (pred: (i: InboxItem) => boolean) => items.filter(pred).length;
  const parts = [
    [count((i) => i.verdict.kind === 'suspicious'), 'suspicious'],
    [count((i) => i.verdict.kind === 'in-books'), 'already in the books'],
    [count((i) => i.verdict.kind === 'new'), 'new'],
    [
      count((i) => i.verdict.kind === 'not-invoice'),
      count((i) => i.verdict.kind === 'not-invoice') === 1 ? 'not an invoice' : 'not invoices',
    ],
    [count((i) => i.verdict.kind === 'unread'), "couldn't be read"],
  ] as const;
  return `${items.length} ${items.length === 1 ? 'document' : 'documents'}: ${parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(', ')}`;
}

/**
 * Purchases › Accounts inbox: the shared accounts mailbox's PDFs and images, each
 * with Bookie's verdict. Read live with the user's own Microsoft 365 access.
 */
export async function AccountsInboxPage({
  orgParam,
  weeks: weeksParam,
}: {
  orgParam: string;
  weeks?: string;
}) {
  const auth = await requireAuth(`/portal/${orgParam}/purchases/accounts-inbox`);
  const { connector, base } = await orgContext(orgParam);
  const crumbs = [{ label: 'Purchases', href: `${base}/purchases` }];
  const weeks = WEEK_CHOICES.find((w) => String(w) === weeksParam) ?? DEFAULT_WEEKS;

  const setup = await accountsMailbox(auth);
  if (!setup.ok && setup.reason === 'not-set') return <MailboxNotSet crumbs={crumbs} />;
  if (!setup.ok)
    return (
      <>
        <PageHeader title="Accounts inbox" crumbs={crumbs} />
        <ErrorPanel title="Bookie couldn't read your settings" message={setup.message} />
      </>
    );

  const mailbox = setup.reader.mailbox;
  const result = await reviewMailbox(auth, setup.reader, connector, weeks)
    .then((items) => ({ items }))
    .catch((error: unknown) => ({
      error:
        isMailboxError(error) || isConnectorError(error)
          ? error.message
          : 'The accounts mailbox could not be read.',
    }));

  const header = (
    <PageHeader
      title="Accounts inbox"
      crumbs={crumbs}
      meta={
        <span className="flex flex-wrap items-center gap-1.5">
          <MailCheck className="h-3.5 w-3.5" aria-hidden /> Read live from{' '}
          <span className="text-body font-mono text-xs break-all" data-testid="accounts-mailbox">
            {mailbox}
          </span>{' '}
          as you. Nothing is moved, marked as read or kept.
        </span>
      }
      actions={
        <nav aria-label="Period" className="flex items-center gap-1 text-sm">
          {WEEK_CHOICES.map((w) => (
            <Link
              key={w}
              href={`${base}/purchases/accounts-inbox?weeks=${w}`}
              aria-current={w === weeks ? 'page' : undefined}
              className={cn(
                'rounded-lg px-2.5 py-1',
                w === weeks ? 'bg-surface-2 text-ink font-medium' : 'text-muted hover:text-ink'
              )}
            >
              {w} {w === 1 ? 'week' : 'weeks'}
            </Link>
          ))}
        </nav>
      }
    />
  );

  if ('error' in result)
    return (
      <>
        {header}
        <ErrorPanel title={`Couldn't open ${mailbox}`} message={result.error} />
      </>
    );

  const { items } = result;
  if (items.length === 0)
    return (
      <>
        {header}
        <EmptyState
          icon={<Mailbox className="h-6 w-6" />}
          title={`No PDFs or images in the last ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`}
          body="Emails with a PDF, PNG or JPG attached appear here with Bookie's verdict on each."
        />
      </>
    );

  return (
    <>
      {header}
      <p className="text-muted mb-3 text-sm" data-testid="accounts-inbox-summary">
        {summary(items)}
      </p>
      <ul className="card divide-line divide-y" aria-label="Accounts inbox documents">
        {items.map((item) => {
          const Icon = previewKind(item.contentType) === 'image' ? FileImage : FileText;
          const ex = item.reading?.extraction;
          const bill = item.verdict.kind === 'in-books' ? item.verdict.match.bill : undefined;
          return (
            <li
              key={`${item.messageId}/${item.attachmentId}`}
              className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:gap-4"
              data-testid="accounts-inbox-item"
              data-verdict={item.verdict.kind}
            >
              <Icon className="text-muted mt-0.5 hidden h-5 w-5 shrink-0 sm:block" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate font-medium" title={item.subject}>
                  {item.subject || item.fileName}
                </p>
                <p className="text-muted truncate text-xs">
                  {item.fromName ? `${item.fromName} <${item.from ?? 'no address'}>` : item.from}
                  {item.receivedAt ? ` · ${formatDate(item.receivedAt)}` : ''} · {item.fileName}
                </p>
                <p className="text-body mt-1 text-xs break-words">{verdictDetail(item)}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                <VerdictBadge item={item} />
                {item.supplier?.status === 'none' && item.verdict.kind === 'new' && (
                  <Badge tone="violet">New supplier</Badge>
                )}
                {!!item.diffs?.length && item.verdict.kind !== 'suspicious' && (
                  <Badge tone="amber">Supplier details differ</Badge>
                )}
                {ex?.total !== null &&
                  ex?.total !== undefined &&
                  item.verdict.kind !== 'not-invoice' && (
                    <span className="text-ink num text-sm">
                      <Money amount={ex.total} currency={ex.currency ?? undefined} />
                    </span>
                  )}
                {bill ? (
                  <Link
                    href={`${base}/purchases/bills/${encodeURIComponent(bill.id)}`}
                    className="text-brand-bright text-xs hover:underline"
                  >
                    Open bill {bill.number}
                  </Link>
                ) : (
                  <Link
                    href={itemHref(base, item)}
                    className="text-brand-bright text-xs hover:underline"
                    data-testid="accounts-inbox-open"
                  >
                    {item.verdict.kind === 'new' ? 'Review and create draft bill' : 'Details'}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
