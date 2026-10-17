import Link from 'next/link';
import { Banknote, FileText, Plus, X } from 'lucide-react';
import { orgContext } from '@/lib/portal/context';
import type { Invoice, InvoiceType } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusTabs } from '@/components/ui/StatusTabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { StatusBadge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/ui/SearchBox';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, NotAvailable } from '@/components/ui/States';
import { sourceName } from '@/lib/portal/context';
import { SourceNote } from '@/components/accounting/SourceNote';

export interface ListSearchParams {
  status?: string;
  search?: string;
  page?: string;
  /** Document date range, `YYYY-MM-DD` (e.g. one day from the Home activity chart). */
  from?: string;
  to?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoOrUndefined = (value?: string) => (value && ISO_DATE.test(value) ? value : undefined);

const COPY = {
  sales: {
    title: 'Invoices',
    section: 'Sales',
    path: '/sales/invoices',
    party: 'To',
    newLabel: 'New invoice',
    noun: 'invoices',
  },
  purchase: {
    title: 'Bills',
    section: 'Purchases',
    path: '/purchases/bills',
    party: 'From',
    newLabel: 'New bill',
    noun: 'bills',
  },
} as const;

/** Sales → Invoices and Purchases → Bills: one list, two document types. */
export async function InvoiceListPage({
  orgParam,
  type,
  searchParams,
}: {
  orgParam: string;
  type: InvoiceType;
  searchParams: ListSearchParams;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  const copy = COPY[type];
  const crumbs = [
    { label: copy.section, href: `${base}${type === 'sales' ? '/sales' : '/purchases'}` },
  ];
  if (!connector.invoices) return <NotAvailable feature={copy.title} source={sourceName(org)} />;

  const status = searchParams.status ?? 'all';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = isoOrUndefined(searchParams.from);
  const to = isoOrUndefined(searchParams.to);
  // "Captured by Bookie": draft bills the Bookie agent drafted from captured documents.
  const capture = type === 'purchase' ? connector.capture : undefined;
  const result =
    status === 'captured' && capture
      ? await capture.capturedBills({ page })
      : await connector.invoices.list(type, {
          status,
          search: searchParams.search,
          from,
          to,
          page,
          pageSize: 50,
        });
  const listPath = `${base}${copy.path}`;
  const clearDates = new URLSearchParams(
    Object.entries({ status: searchParams.status, search: searchParams.search }).filter(
      (e): e is [string, string] => !!e[1]
    )
  );

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Number',
      cell: (i) => <span className="text-ink font-medium">{i.number || '—'}</span>,
    },
    {
      key: 'ref',
      header: 'Ref',
      cell: (i) => <span className="text-muted">{i.reference ?? ''}</span>,
      hideOnMobile: true,
    },
    {
      key: 'contact',
      header: copy.party,
      cell: (i) => <span className="text-ink">{i.contact.name}</span>,
    },
    { key: 'date', header: 'Date', cell: (i) => formatDate(i.date), hideOnMobile: true },
    {
      key: 'due',
      header: 'Due date',
      cell: (i) => (
        <span className={i.isOverdue ? 'text-danger font-medium' : undefined}>
          {formatDate(i.dueDate)}
        </span>
      ),
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      cell: (i) => <Money amount={i.amountPaid} missing={result.note} />,
      hideOnMobile: true,
    },
    {
      key: 'amountDue',
      header: 'Due',
      align: 'right',
      cell: (i) => (
        <Money
          amount={i.amountDue}
          currency={i.currency}
          className="text-ink"
          missing={result.note}
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => <StatusBadge status={i.status} overdue={i.isOverdue} />,
    },
  ];

  const canCreate = !!connector.invoices.create;
  // Xero's "Awaiting payment" bills tab offers a batch payment.
  const canPayBills =
    type === 'purchase' && status === 'authorised' && !!connector.payments?.createBatch;
  return (
    <>
      <PageHeader
        title={copy.title}
        crumbs={crumbs}
        actions={
          <>
            {canPayBills && result.items.length > 0 && (
              <ButtonLink href={`${listPath}/pay`} variant="secondary">
                <Banknote className="h-4 w-4" /> Pay bills
              </ButtonLink>
            )}
            {canCreate && (
              <ButtonLink href={`${listPath}/new`} variant="primary">
                <Plus className="h-4 w-4" /> {copy.newLabel}
              </ButtonLink>
            )}
          </>
        }
      />
      <StatusTabs
        basePath={listPath}
        current={status}
        params={{ search: searchParams.search, from, to }}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'draft', label: 'Draft' },
          { value: 'submitted', label: 'Awaiting approval' },
          { value: 'authorised', label: 'Awaiting payment' },
          { value: 'overdue', label: 'Overdue' },
          { value: 'paid', label: 'Paid' },
          ...(capture ? [{ value: 'captured', label: 'Captured by Bookie' }] : []),
        ]}
      />
      <SourceNote>{result.note}</SourceNote>
      {status !== 'captured' && (
        <div className="mb-4 flex items-center gap-3">
          <SearchBox
            placeholder={`Search ${copy.noun} by number, reference or contact`}
            className="w-full max-w-md"
          />
          {(from || to) && (
            <span className="border-line text-body inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs whitespace-nowrap">
              {from === to
                ? `Dated ${formatDate(from)}`
                : `Dated ${from ? formatDate(from) : '…'} to ${to ? formatDate(to) : '…'}`}
              <Link
                href={`${listPath}${clearDates.size ? `?${clearDates}` : ''}`}
                className="text-muted hover:text-ink"
                aria-label="Clear date filter"
              >
                <X className="h-3.5 w-3.5" />
              </Link>
            </span>
          )}
        </div>
      )}
      <DataTable
        columns={columns}
        rows={result.items}
        rowKey={(i) => i.id}
        rowHref={(i) => `${listPath}/${encodeURIComponent(i.id)}`}
        empty={
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title={
              status === 'captured'
                ? 'No bills captured by Bookie are waiting'
                : searchParams.search
                  ? `No ${copy.noun} match “${searchParams.search}”`
                  : from && from === to
                    ? `No ${copy.noun} dated ${formatDate(from)}`
                    : from || to
                      ? `No ${copy.noun} in this date range`
                      : `No ${copy.noun} here yet`
            }
            action={
              canCreate && (
                <ButtonLink href={`${listPath}/new`} variant="primary">
                  {copy.newLabel}
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
        params={{ status: searchParams.status, search: searchParams.search, from, to }}
      />
    </>
  );
}
