import { Banknote } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import type { BatchPayment, Payment } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusTabs } from '@/components/ui/StatusTabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/ui/SearchBox';
import { EmptyState, NotAvailable } from '@/components/ui/States';

export const metadata = { title: 'Payments' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const [{ org: orgParam }, query] = await Promise.all([params, searchParams]);
  const { connector, base, org } = await orgContext(orgParam);
  const crumbs = [{ label: 'Accounting', href: `${base}/accounting` }];
  if (!connector.payments) {
    return (
      <>
        <PageHeader title="Payments" crumbs={crumbs} />
        <NotAvailable feature="Payments" source={sourceName(org)} />
      </>
    );
  }
  const invoiceType =
    query.status === 'sales' ? 'sales' : query.status === 'purchase' ? 'purchase' : undefined;
  const page = Math.max(1, Number(query.page) || 1);
  const listPath = `${base}/accounting/payments`;
  const batchList = connector.payments.batches;
  const tabs = [
    { value: 'all', label: 'All' },
    { value: 'sales', label: 'Received' },
    { value: 'purchase', label: 'Paid' },
    ...(batchList ? [{ value: 'batches', label: 'Batch payments' }] : []),
  ];

  if (query.status === 'batches' && batchList) {
    const batches = await batchList({ search: query.search, page, pageSize: 50 });
    const batchColumns: Column<BatchPayment>[] = [
      { key: 'date', header: 'Date', cell: (b) => formatDate(b.date) },
      {
        key: 'type',
        header: 'Type',
        cell: (b) => (
          <span className="text-ink">
            {b.type === 'purchase' ? 'Bill payments' : 'Invoice receipts'}
          </span>
        ),
      },
      {
        key: 'bank',
        header: 'Bank account',
        cell: (b) => <span className="text-muted">{b.bankAccountName ?? ''}</span>,
      },
      {
        key: 'reference',
        header: 'Reference',
        cell: (b) => <span className="text-muted">{b.reference ?? ''}</span>,
        hideOnMobile: true,
      },
      {
        key: 'count',
        header: 'Payments',
        align: 'right',
        cell: (b) => <span className="num">{b.payments.length}</span>,
        hideOnMobile: true,
      },
      {
        key: 'amount',
        header: 'Amount',
        align: 'right',
        cell: (b) => <Money amount={b.total} currency={b.currency} className="text-ink" />,
      },
    ];
    return (
      <>
        <PageHeader title="Payments" crumbs={crumbs} />
        <StatusTabs
          basePath={listPath}
          current="batches"
          params={{ search: query.search }}
          tabs={tabs}
        />
        <div className="mb-4">
          <SearchBox placeholder="Search batch payments" className="w-full max-w-md" />
        </div>
        <DataTable
          columns={batchColumns}
          rows={batches.items}
          rowKey={(b) => b.id}
          empty={
            <EmptyState
              icon={<Banknote className="h-6 w-6" />}
              title={
                query.search ? `No batch payments match “${query.search}”` : 'No batch payments yet'
              }
              body="Pay several bills at once from Purchases › Bills › Awaiting payment."
            />
          }
        />
        <Pagination
          page={batches.page}
          hasMore={batches.hasMore}
          basePath={listPath}
          params={{ status: 'batches', search: query.search }}
        />
      </>
    );
  }

  const result = await connector.payments.list({
    invoiceType,
    search: query.search,
    page,
    pageSize: 50,
  });

  const columns: Column<Payment>[] = [
    { key: 'date', header: 'Date', cell: (p) => formatDate(p.date) },
    {
      key: 'contact',
      header: 'Contact',
      cell: (p) => <span className="text-ink">{p.contact?.name ?? '—'}</span>,
    },
    {
      key: 'invoice',
      header: 'Invoice',
      cell: (p) => (
        <span className="flex flex-col">
          <span>{p.invoiceNumber ?? '—'}</span>
          {p.invoiceType && (
            <span className="text-faint text-xs">
              {p.invoiceType === 'sales' ? 'Invoice payment' : 'Bill payment'}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      cell: (p) => <span className="text-muted">{p.reference ?? ''}</span>,
      hideOnMobile: true,
    },
    {
      key: 'bank',
      header: 'Bank account',
      cell: (p) => <span className="text-muted">{p.bankAccountName ?? ''}</span>,
      hideOnMobile: true,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (p) => <Money amount={p.amount} currency={p.currency} className="text-ink" />,
    },
  ];

  return (
    <>
      <PageHeader title="Payments" crumbs={crumbs} />
      <StatusTabs
        basePath={listPath}
        current={invoiceType ?? 'all'}
        params={{ search: query.search }}
        tabs={tabs}
      />
      <div className="mb-4">
        <SearchBox placeholder="Search payments" className="w-full max-w-md" />
      </div>
      <DataTable
        columns={columns}
        rows={result.items}
        rowKey={(p) => p.id}
        empty={
          <EmptyState
            icon={<Banknote className="h-6 w-6" />}
            title={query.search ? `No payments match “${query.search}”` : 'No payments yet'}
          />
        }
      />
      <Pagination
        page={result.page}
        hasMore={result.hasMore}
        basePath={listPath}
        params={{ status: query.status, search: query.search }}
      />
    </>
  );
}
