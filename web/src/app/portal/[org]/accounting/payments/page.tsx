import { Banknote } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import type { Payment } from '@/lib/domain/types';
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
  const result = await connector.payments.list({
    invoiceType,
    search: query.search,
    page,
    pageSize: 50,
  });
  const listPath = `${base}/accounting/payments`;

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
      cell: (p) => (
        <span className="flex flex-col items-end">
          <Money amount={p.amount} currency={p.currency} className="text-ink" />
          {/* Foreign-currency payments: what reached the bank, as the source reports it. */}
          {p.bankAmount !== undefined && p.bankCurrency && p.bankCurrency !== p.currency && (
            <Money amount={p.bankAmount} currency={p.bankCurrency} className="text-faint text-xs" />
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Payments" crumbs={crumbs} />
      <StatusTabs
        basePath={listPath}
        current={invoiceType ?? 'all'}
        params={{ search: query.search }}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'sales', label: 'Received' },
          { value: 'purchase', label: 'Paid' },
        ]}
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
