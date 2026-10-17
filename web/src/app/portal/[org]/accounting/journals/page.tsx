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
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState, NotAvailable } from '@/components/ui/States';
import { SourceNote } from '@/components/accounting/SourceNote';

export const metadata = { title: 'Manual journals' };

const LABELS: Record<string, string> = {
  all: 'All',
  draft: 'Draft',
  posted: 'Posted',
  voided: 'Voided',
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
    from?: string;
    to?: string;
  }>;
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
  const statuses = ['all', ...(connector.journals.statuses ?? ['draft', 'posted'])];
  const status = statuses.includes(query.status ?? '') ? query.status! : 'all';
  const from = query.from && ISO.test(query.from) ? query.from : undefined;
  const to = query.to && ISO.test(query.to) ? query.to : undefined;
  const page = Math.max(1, Number(query.page) || 1);
  const result = await connector.journals.list({
    status,
    search: query.search,
    from,
    to,
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
        params={{ search: query.search, from, to }}
        tabs={statuses.map((value) => ({ value, label: LABELS[value] ?? value }))}
      />
      <SourceNote>{result.note}</SourceNote>
      <form
        method="get"
        action={listPath}
        aria-label="Filter journals"
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        {status !== 'all' && <input type="hidden" name="status" value={status} />}
        <Field label="Narration" htmlFor="journal-search" className="w-full sm:w-72">
          <Input
            id="journal-search"
            name="search"
            type="search"
            placeholder="Search by narration"
            defaultValue={query.search}
          />
        </Field>
        <Field label="From" htmlFor="journal-from" className="w-[calc(50%-0.375rem)] sm:w-40">
          <Input id="journal-from" name="from" type="date" defaultValue={from} />
        </Field>
        <Field label="To" htmlFor="journal-to" className="w-[calc(50%-0.375rem)] sm:w-40">
          <Input id="journal-to" name="to" type="date" defaultValue={to} />
        </Field>
        <Button type="submit">Apply</Button>
      </form>
      <DataTable
        columns={columns}
        rows={result.items}
        rowKey={(j) => j.id}
        rowHref={(j) => `${listPath}/${encodeURIComponent(j.id)}`}
        empty={
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title={
              query.search || from || to
                ? 'No journals match these filters'
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
        params={{ status: query.status, search: query.search, from, to }}
      />
    </>
  );
}
