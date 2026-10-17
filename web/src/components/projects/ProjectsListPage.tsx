import { FolderKanban } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { Page, Project, ProjectStatus } from '@/lib/domain/types';
import { SourceNote } from '@/components/accounting/SourceNote';

const DEFAULT_STATUSES: ProjectStatus[] = ['in-progress', 'closed'];
const TAB_LABEL: Record<ProjectStatus, string> = {
  'in-progress': 'In progress',
  closed: 'Closed',
  unknown: 'All projects (status not available)',
};
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusTabs } from '@/components/ui/StatusTabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/ui/SearchBox';
import { EmptyState, NotAvailable } from '@/components/ui/States';

export interface ProjectsSearchParams {
  status?: string;
  search?: string;
  page?: string;
}

export async function ProjectsListPage({
  orgParam,
  searchParams,
}: {
  orgParam: string;
  searchParams: ProjectsSearchParams;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.projects) return <NotAvailable feature="Projects" source={sourceName(org)} />;

  // Sources that can't tell in progress from closed (BC) list every project under one
  // "status not available" tab rather than calling them all in progress.
  const statuses = connector.projects.statuses ?? DEFAULT_STATUSES;
  const status: ProjectStatus = statuses.includes(searchParams.status as ProjectStatus)
    ? (searchParams.status as ProjectStatus)
    : statuses[0];
  const page = Math.max(1, Number(searchParams.page) || 1);
  const listPath = `${base}/projects`;
  let result: Page<Project>;
  try {
    result = await connector.projects.list({
      status,
      search: searchParams.search,
      page,
      pageSize: 50,
    });
  } catch (error) {
    // Xero answers 401/403 when Projects isn't enabled for the org or connection.
    if (org.kind === 'xero' && isConnectorError(error) && [401, 403, 404].includes(error.status)) {
      return (
        <>
          <PageHeader title="Projects" />
          <EmptyState
            icon={<FolderKanban className="h-6 w-6" />}
            title="Projects isn't available in Xero for this organisation"
            body="Xero Projects isn't enabled for this organisation, or the connection doesn't have access to it."
          />
        </>
      );
    }
    throw error;
  }

  const columns: Column<Project>[] = [
    {
      key: 'name',
      header: 'Project',
      cell: (p) => <span className="text-ink font-medium">{p.name}</span>,
    },
    { key: 'contact', header: 'Contact', cell: (p) => p.contact?.name ?? '—' },
    {
      key: 'deadline',
      header: 'Deadline',
      cell: (p) => formatDate(p.deadline),
      hideOnMobile: true,
    },
    {
      key: 'estimate',
      header: 'Estimate',
      align: 'right',
      cell: (p) => <Money amount={p.estimate} currency={p.currency} />,
      hideOnMobile: true,
    },
    {
      key: 'invoiced',
      header: 'Invoiced',
      align: 'right',
      cell: (p) => <Money amount={p.totalInvoiced} currency={p.currency} className="text-ink" />,
    },
    {
      key: 'toInvoice',
      header: 'To invoice',
      align: 'right',
      cell: (p) => <Money amount={p.totalToInvoice} currency={p.currency} />,
    },
  ];

  return (
    <>
      <PageHeader title="Projects" />
      <StatusTabs
        basePath={listPath}
        current={status}
        params={{ search: searchParams.search }}
        tabs={statuses.map((value) => ({ value, label: TAB_LABEL[value] }))}
      />
      <SourceNote>{result.note}</SourceNote>
      <div className="mb-4 flex items-center gap-3">
        <SearchBox placeholder="Search projects by name or contact" className="w-full max-w-md" />
      </div>
      <DataTable
        columns={columns}
        rows={result.items}
        rowKey={(p) => p.id}
        rowHref={(p) => `${listPath}/${encodeURIComponent(p.id)}`}
        empty={
          <EmptyState
            icon={<FolderKanban className="h-6 w-6" />}
            title={
              searchParams.search
                ? `No projects match “${searchParams.search}”`
                : status === 'closed'
                  ? 'No closed projects'
                  : status === 'unknown'
                    ? 'No projects'
                    : 'No projects in progress'
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
