import { ArrowLeftRight, Plus } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import type { BankTransfer } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/ui/SearchBox';
import { EmptyState } from '@/components/ui/States';

export const metadata = { title: 'Bank transfers' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const [{ org: orgParam }, query] = await Promise.all([params, searchParams]);
  const { connector, base, org } = await orgContext(orgParam);
  const bankPath = `${base}/accounting/bank`;
  const crumbs = [
    { label: 'Accounting', href: `${base}/accounting` },
    { label: 'Bank accounts', href: bankPath },
  ];
  const list = connector.bank?.transfers;
  if (!list) {
    return (
      <>
        <PageHeader title="Bank transfers" crumbs={crumbs} />
        <EmptyState
          icon={<ArrowLeftRight className="h-6 w-6" />}
          title="Bank transfers aren't available for this organisation"
          body={
            org.kind === 'business-central'
              ? "Business Central's API has no bank transfer records, and moving money between bank accounts there means posting a journal batch, which Bookie doesn't do. Use a general journal in Business Central."
              : `${sourceName(org)} doesn't expose bank transfers through its API.`
          }
        />
      </>
    );
  }
  const page = Math.max(1, Number(query.page) || 1);
  const result = await list({ search: query.search, page, pageSize: 50 });
  const canCreate = !!connector.bank?.createTransfer;
  const listPath = `${bankPath}/transfers`;

  const columns: Column<BankTransfer>[] = [
    { key: 'date', header: 'Date', cell: (t) => formatDate(t.date) },
    {
      key: 'from',
      header: 'From',
      cell: (t) => <span className="text-ink">{t.from.name ?? 'Unknown account'}</span>,
    },
    {
      key: 'to',
      header: 'To',
      cell: (t) => <span className="text-ink">{t.to.name ?? 'Unknown account'}</span>,
    },
    {
      key: 'reference',
      header: 'Reference',
      cell: (t) => <span className="text-muted">{t.reference ?? ''}</span>,
      hideOnMobile: true,
    },
    {
      key: 'reconciled',
      header: 'Reconciled',
      hideOnMobile: true,
      cell: (t) =>
        t.fromIsReconciled === undefined && t.toIsReconciled === undefined ? (
          <span className="text-faint">—</span>
        ) : (
          <span className="text-muted">
            {t.fromIsReconciled && t.toIsReconciled
              ? 'Both'
              : t.fromIsReconciled
                ? 'From only'
                : t.toIsReconciled
                  ? 'To only'
                  : 'No'}
          </span>
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cell: (t) => <Money amount={t.amount} currency={t.currency} className="text-ink" />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Bank transfers"
        crumbs={crumbs}
        actions={
          canCreate && (
            <ButtonLink href={`${bankPath}/transfer`} variant="primary">
              <Plus className="h-4 w-4" /> Transfer money
            </ButtonLink>
          )
        }
      />
      <div className="mb-4">
        <SearchBox placeholder="Search by reference or account" className="w-full max-w-md" />
      </div>
      <DataTable
        columns={columns}
        rows={result.items}
        rowKey={(t) => t.id}
        empty={
          <EmptyState
            icon={<ArrowLeftRight className="h-6 w-6" />}
            title={query.search ? `No transfers match “${query.search}”` : 'No bank transfers yet'}
            action={
              canCreate && (
                <ButtonLink href={`${bankPath}/transfer`} variant="primary">
                  Transfer money
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
        params={{ search: query.search }}
      />
    </>
  );
}
