import { BookOpen, Plus } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import type { ManualJournal } from '@/lib/domain/types';
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
import { SourceNote } from '@/components/accounting/SourceNote';

export const metadata = { title: 'Manual journals' };

const STATUSES = ['all', 'draft', 'posted'];

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
  if (!connector.journals) {
    return (
      <>
        <PageHeader title="Manual journals" crumbs={crumbs} />
        <NotAvailable feature="Manual journals" source={sourceName(org)} />
      </>
    );
  }
  const status = STATUSES.includes(query.status ?? '') ? query.status! : 'all';
  const page = Math.max(1, Number(query.page) || 1);
  const result = await connector.journals.list({
    status,
    search: query.search,
    page,
    pageSize: 50,
  });
  const listPath = `${base}/accounting/journals`;

  const columns: Column<ManualJournal>[] = [
    {
      key: 'narration',
      header: 'Narration',
      cell: (j) => <span className="text-ink font-medium">{j.narration || '—'}</span>,
    },
    { key: 'date', header: 'Date', cell: (j) => formatDate(j.date) },
    {
      key: 'debit',
      header: 'Debit',
      align: 'right',
      cell: (j) => <Money amount={j.total} />,
      hideOnMobile: true,
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right',
      cell: (j) => <Money amount={j.total} />,
    },
    { key: 'status', header: 'Status', cell: (j) => <StatusBadge status={j.status} /> },
  ];

  const canCreate = !!connector.journals.create;
  return (
    <>
      <PageHeader
        title="Manual journals"
        crumbs={crumbs}
        actions={
          canCreate && (
            <ButtonLink href={`${listPath}/new`} variant="primary">
              <Plus className="h-4 w-4" /> New journal
            </ButtonLink>
          )
        }
      />
      <StatusTabs
        basePath={listPath}
        current={status}
        params={{ search: query.search }}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'draft', label: 'Draft' },
          { value: 'posted', label: 'Posted' },
        ]}
      />
      <SourceNote>{result.note}</SourceNote>
      <div className="mb-4">
        <SearchBox placeholder="Search by narration" className="w-full max-w-md" />
      </div>
      <DataTable
        columns={columns}
        rows={result.items}
        rowKey={(j) => j.id}
        rowHref={(j) => `${listPath}/${encodeURIComponent(j.id)}`}
        empty={
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title={
              query.search
                ? `No journals match “${query.search}”`
                : status === 'all'
                  ? 'No manual journals yet'
                  : `No ${status} journals`
            }
            action={
              canCreate && (
                <ButtonLink href={`${listPath}/new`} variant="primary">
                  New journal
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
        params={{ status: query.status, search: query.search }}
      />
    </>
  );
}
