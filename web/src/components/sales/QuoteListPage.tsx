import { FileText, Plus } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import type { Quote } from '@/lib/domain/types';
import { formatDate, todayIso } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusTabs } from '@/components/ui/StatusTabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { StatusBadge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/ui/SearchBox';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, NotAvailable } from '@/components/ui/States';
import type { ListSearchParams } from '@/components/documents/InvoiceListPage';

/** Sales → Quotes, with Xero's tabs: All · Draft · Sent · Declined · Accepted · Invoiced. */
export async function QuoteListPage({
  orgParam,
  searchParams,
}: {
  orgParam: string;
  searchParams: ListSearchParams;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  const crumbs = [{ label: 'Sales', href: `${base}/sales` }];
  if (!connector.quotes) {
    return (
      <>
        <PageHeader title="Quotes" crumbs={crumbs} />
        <NotAvailable feature="Quotes" source={sourceName(org)} />
      </>
    );
  }

  const status = searchParams.status ?? 'all';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const result = await connector.quotes.list({
    status,
    search: searchParams.search,
    page,
    pageSize: 50,
  });
  const listPath = `${base}/sales/quotes`;
  const today = todayIso();
  const isExpired = (q: Quote) =>
    (q.status === 'sent' || q.status === 'draft') && !!q.expiryDate && q.expiryDate < today;

  const columns: Column<Quote>[] = [
    {
      key: 'number',
      header: 'Number',
      cell: (q) => <span className="text-ink font-medium">{q.number || '—'}</span>,
    },
    {
      key: 'ref',
      header: 'Ref',
      cell: (q) => <span className="text-muted">{q.reference ?? ''}</span>,
      hideOnMobile: true,
    },
    {
      key: 'contact',
      header: 'To',
      cell: (q) => (
        <span className="min-w-0">
          <span className="text-ink block">{q.contact.name}</span>
          {q.title && <span className="text-faint block truncate text-xs">{q.title}</span>}
        </span>
      ),
    },
    { key: 'date', header: 'Date', cell: (q) => formatDate(q.date), hideOnMobile: true },
    {
      key: 'expiry',
      header: 'Expiry date',
      cell: (q) => (
        <span className={isExpired(q) ? 'text-danger font-medium' : undefined}>
          {formatDate(q.expiryDate)}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'total',
      header: 'Amount',
      align: 'right',
      cell: (q) => <Money amount={q.total} currency={q.currency} className="text-ink" />,
    },
    { key: 'status', header: 'Status', cell: (q) => <StatusBadge status={q.status} /> },
  ];

  const canCreate = !!connector.quotes.create;
  return (
    <>
      <PageHeader
        title="Quotes"
        crumbs={crumbs}
        actions={
          canCreate && (
            <ButtonLink href={`${listPath}/new`} variant="primary">
              <Plus className="h-4 w-4" /> New quote
            </ButtonLink>
          )
        }
      />
      <StatusTabs
        basePath={listPath}
        current={status}
        params={{ search: searchParams.search }}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'draft', label: 'Draft' },
          { value: 'sent', label: 'Sent' },
          { value: 'declined', label: 'Declined' },
          { value: 'accepted', label: 'Accepted' },
          { value: 'invoiced', label: 'Invoiced' },
        ]}
      />
      <div className="mb-4 flex items-center gap-3">
        <SearchBox
          placeholder="Search quotes by number, reference, title or customer"
          className="w-full max-w-md"
        />
      </div>
      <DataTable
        columns={columns}
        rows={result.items}
        rowKey={(q) => q.id}
        rowHref={(q) => `${listPath}/${encodeURIComponent(q.id)}`}
        empty={
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title={
              searchParams.search
                ? `No quotes match “${searchParams.search}”`
                : status === 'all'
                  ? 'No quotes here yet'
                  : 'No quotes with this status'
            }
            body={
              status === 'all' && !searchParams.search
                ? 'Quotes you create, send and win show up here.'
                : undefined
            }
            action={
              canCreate && (
                <ButtonLink href={`${listPath}/new`} variant="primary">
                  New quote
                </ButtonLink>
              )
            }
          />
        }
      />
      <Pagination
        page={result.page}
        hasMore={result.hasMore}
        basePath={listPath}
        params={{ status: searchParams.status, search: searchParams.search }}
      />
    </>
  );
}
