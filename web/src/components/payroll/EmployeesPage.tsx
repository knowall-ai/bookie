import { Users } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import type { Employee, Page } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusTabs } from '@/components/ui/StatusTabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/ui/SearchBox';
import { EmptyState, NotAvailable } from '@/components/ui/States';
import { isPayrollNotSetUp, PayrollNotSetUp } from './PayrollParts';

export interface EmployeesSearchParams {
  status?: string;
  search?: string;
  page?: string;
}

export async function EmployeesPage({
  orgParam,
  searchParams,
}: {
  orgParam: string;
  searchParams: EmployeesSearchParams;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  const crumbs = [{ label: 'Payroll', href: `${base}/payroll` }];
  if (!connector.payroll) return <NotAvailable feature="Payroll" source={sourceName(org)} />;

  const status = searchParams.status === 'left' ? 'left' : 'current';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const listPath = `${base}/payroll/employees`;

  let result: Page<Employee> | undefined;
  try {
    result = await connector.payroll.employees({ page, pageSize: 50, search: searchParams.search });
  } catch (error) {
    if (!isPayrollNotSetUp(error, org.kind)) throw error;
  }

  const rows = result?.items.filter((e) => (status === 'left') === (e.status === 'terminated'));
  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (e) => (
        <span className="text-ink font-medium">
          {e.firstName} {e.lastName}
        </span>
      ),
    },
    { key: 'job', header: 'Job title', cell: (e) => e.jobTitle ?? '—' },
    {
      key: 'email',
      header: 'Email',
      cell: (e) => <span className="text-muted">{e.email ?? '—'}</span>,
      hideOnMobile: true,
    },
    {
      key: 'start',
      header: 'Start date',
      cell: (e) => formatDate(e.startDate),
      hideOnMobile: true,
    },
    { key: 'status', header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
  ];

  return (
    <>
      <PageHeader title="Employees" crumbs={crumbs} />
      {!result || !rows ? (
        <PayrollNotSetUp source={sourceName(org)} />
      ) : (
        <>
          <StatusTabs
            basePath={listPath}
            current={status}
            params={{ search: searchParams.search }}
            tabs={[
              { value: 'current', label: 'Current' },
              { value: 'left', label: 'Left' },
            ]}
          />
          <div className="mb-4 flex items-center gap-3">
            <SearchBox
              placeholder="Search employees by name, email or job title"
              className="w-full max-w-md"
            />
          </div>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(e) => e.id}
            empty={
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={
                  searchParams.search
                    ? `No employees match “${searchParams.search}”`
                    : status === 'left'
                      ? 'No former employees'
                      : 'No employees yet'
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
      )}
    </>
  );
}
