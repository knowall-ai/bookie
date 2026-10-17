import { Percent } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import type { TaxRate } from '@/lib/domain/types';
import { formatNumber } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState, NotAvailable } from '@/components/ui/States';
import { SourceNote } from '@/components/accounting/SourceNote';

export const metadata = { title: 'Tax rates' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { connector, base, org } = await orgContext(orgParam);
  const crumbs = [{ label: 'Accounting', href: `${base}/accounting` }];
  if (!connector.taxRates) {
    return (
      <>
        <PageHeader title="Tax rates" crumbs={crumbs} />
        <NotAvailable feature="Tax rates" source={sourceName(org)} />
      </>
    );
  }
  const rates = (await connector.taxRates.list()).sort(
    (a, b) =>
      (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1) || a.name.localeCompare(b.name)
  );
  const unquantified = rates.some((r) => r.rate === undefined);

  const columns: Column<TaxRate>[] = [
    {
      key: 'name',
      header: 'Tax rate',
      cell: (r) => <span className="text-ink font-medium">{r.name}</span>,
    },
    {
      key: 'code',
      header: 'Tax code',
      cell: (r) => <span className="text-muted num">{r.taxType}</span>,
      hideOnMobile: true,
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      cell: (r) =>
        r.rate === undefined ? (
          <span className="text-faint">Not available</span>
        ) : (
          <span className="num text-ink">{formatNumber(r.rate, 4)}%</span>
        ),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader title="Tax rates" crumbs={crumbs} />
      <SourceNote>
        {unquantified
          ? `${sourceName(org)}'s API lists these tax codes but not their percentages, which are set up in VAT posting setup or tax details there.`
          : undefined}
      </SourceNote>
      <DataTable
        columns={columns}
        rows={rates}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={<Percent className="h-6 w-6" />} title="No tax rates set up" />}
      />
    </>
  );
}
