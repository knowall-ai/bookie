import Link from 'next/link';
import { Bot, Download, FileImage, FileText, Inbox as InboxIcon, Mail, Plus } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import { formatFileSize, inboxFileUrl, previewKind } from '@/lib/attachments';
import { formatDate } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorPanel, NotAvailable } from '@/components/ui/States';
import { FilePreview } from './FilePreview';

/** Purchases › Inbox: documents waiting in the source's capture inbox (Xero Files › Inbox). */
export async function InboxPage({ orgParam, fileId }: { orgParam: string; fileId?: string }) {
  const { connector, base, org } = await orgContext(orgParam);
  const crumbs = [{ label: 'Purchases', href: `${base}/purchases` }];
  const source = sourceName(org);
  if (!connector.capture)
    return (
      <>
        <PageHeader title="Inbox" crumbs={crumbs} />
        <NotAvailable feature="Inbox" source={source} />
      </>
    );

  const result = await connector.capture
    .inbox()
    .then((inbox) => ({ inbox }))
    .catch((error: unknown) => ({
      error: isConnectorError(error) ? error.message : 'The inbox could not be loaded.',
    }));
  if ('error' in result)
    return (
      <>
        <PageHeader title="Inbox" crumbs={crumbs} />
        <ErrorPanel title="Couldn't load the inbox" message={result.error} />
      </>
    );

  const { files, email, note } = result.inbox;
  const selected = files.find((f) => f.id === fileId) ?? files[0];
  const canCreate = !!connector.invoices?.create && !!connector.capture.attachToBill;
  const inboxPath = `${base}/purchases/inbox`;

  return (
    <>
      <PageHeader
        title="Inbox"
        crumbs={crumbs}
        meta={
          email ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" aria-hidden /> Email bills and receipts to{' '}
              <span className="text-body font-mono text-xs break-all">{email}</span>
            </span>
          ) : undefined
        }
        actions={
          <ButtonLink href={`${base}/purchases/bills?status=captured`} variant="ghost" size="sm">
            <Bot className="h-4 w-4" /> Captured by Bookie
          </ButtonLink>
        }
      />
      {note && <p className="text-warn mb-4 text-sm">{note}</p>}

      {files.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="h-6 w-6" />}
          title="Your inbox is empty"
          body={`Documents emailed or uploaded to the ${source} Files inbox appear here, ready to turn into bills. Bookie also drafts bills from them; those show under Bills › Captured by Bookie.`}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <ul className="card divide-line divide-y self-start" aria-label="Inbox files">
            {files.map((f) => {
              const Icon = previewKind(f.contentType) === 'image' ? FileImage : FileText;
              const active = f.id === selected?.id;
              return (
                <li key={f.id}>
                  <Link
                    href={`${inboxPath}?file=${encodeURIComponent(f.id)}`}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'hover:bg-surface-2 flex items-center gap-3 px-4 py-3 text-sm transition-colors',
                      active && 'bg-surface-2 shadow-[inset_3px_0_0_var(--color-brand)]'
                    )}
                  >
                    <Icon className="text-muted h-5 w-5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="text-ink block truncate font-medium" title={f.fileName}>
                        {f.fileName}
                      </span>
                      <span className="text-muted block text-xs">
                        {f.receivedAt
                          ? `Received ${formatDate(f.receivedAt)}`
                          : `Date not available from ${source}`}
                        {formatFileSize(f.size) ? ` · ${formatFileSize(f.size)}` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {selected && (
            <section className="card min-w-0 p-5" aria-label={`Preview of ${selected.fileName}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-ink min-w-0 truncate text-[15px] font-semibold">
                  {selected.fileName}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={inboxFileUrl(org.key, selected.id, true)}
                    download={selected.fileName}
                    className="text-body hover:bg-surface-2 hover:text-ink inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                  {canCreate && (
                    <ButtonLink
                      href={`${inboxPath}/${encodeURIComponent(selected.id)}/bill`}
                      variant="primary"
                      size="sm"
                    >
                      <Plus className="h-4 w-4" /> Create bill from this
                    </ButtonLink>
                  )}
                </div>
              </div>
              <FilePreview
                src={inboxFileUrl(org.key, selected.id)}
                fileName={selected.fileName}
                contentType={selected.contentType}
              />
            </section>
          )}
        </div>
      )}
    </>
  );
}
