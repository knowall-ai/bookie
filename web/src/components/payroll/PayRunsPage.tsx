import { Banknote } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import type { Page, PayRun } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { StatusBadge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, NotAvailable } from '@/components/ui/States';
import { isPayrollNotSetUp, PayrollNotSetUp } from './PayrollParts';

export async function PayRunsPage({
  orgParam,
  searchParams,
}: {
  orgParam: string;
  searchParams: { page?: string };
}) {
  const { connector, base, org } = await orgContext(orgParam);
  const crumbs = [{ label: 'Payroll', href: `${base}/payroll` }];
  if (!connector.payroll) return <NotAvailable feature="Payroll" source={sourceName(org)} />;

  const page = Math.max(1, Number(searchParams.page) || 1);
  const listPath = `${base}/payroll/pay-runs`;
  let result: Page<PayRun> | undefined;
  try {
    result = await connector.payroll.payRuns({ page, pageSize: 50 });
  } catch (error) {
    if (!isPayrollNotSetUp(error, org.kind)) throw error;
  }

  const columns: Column<PayRun>[] = [
    {
      key: 'period',
      header: 'Pay period',
      cell: (r) => (
        <span className="text-ink font-medium">
          {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
        </span>
      ),
    },
    { key: 'payment', header: 'Payment date', cell: (r) => formatDate(r.paymentDate) },
    {
      key: 'calendar',
      header: 'Calendar',
      cell: (r) => <span className="text-muted">{r.calendarName ?? '—'}</span>,
      hideOnMobile: true,
    },
    {
      key: 'employees',
      header: 'Employees',
      align: 'right',
      cell: (r) => <span className="num">{r.employeeCount ?? '—'}</span>,
      hideOnMobile: true,
    },
    {
      key: 'pay',
      header: 'Total pay',
      align: 'right',
      cell: (r) => <Money amount={r.totalPay} currency={org.baseCurrency} />,
    },
    {
      key: 'cost',
      header: 'Total cost',
      align: 'right',
      cell: (r) => <Money amount={r.totalCost} currency={org.baseCurrency} className="text-ink" />,
      hideOnMobile: true,
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  ];

  const empty =
    org.kind === 'business-central' ? (
      <EmptyState
        icon={<Banknote className="h-6 w-6" />}
        title="Pay runs aren't available from Business Central"
        body="Business Central has no payroll API, so Bookie can show employees but not pay runs."
      />
    ) : (
      <EmptyState icon={<Banknote className="h-6 w-6" />} title="No pay runs yet" />
    );

  return (
    <>
      <PageHeader title="Pay runs" crumbs={crumbs} />
      {!result ? (
        <PayrollNotSetUp source={sourceName(org)} />
      ) : (
        <>
          <DataTable columns={columns} rows={result.items} rowKey={(r) => r.id} empty={empty} />
          <Pagination page={result.page} hasMore={result.hasMore} basePath={listPath} />
        </>
      )}
    </>
  );
}
