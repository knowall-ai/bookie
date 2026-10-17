import { Boxes } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { FixedAsset } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusTabs } from '@/components/ui/StatusTabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/ui/SearchBox';
import { EmptyState, ErrorPanel, NotAvailable } from '@/components/ui/States';
import { SourceNote } from '@/components/accounting/SourceNote';

export const metadata = { title: 'Fixed assets' };

type AssetStatus = FixedAsset['status'];
const STATUSES: AssetStatus[] = ['draft', 'registered', 'disposed'];

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
  if (!connector.assets) {
    return (
      <>
        <PageHeader title="Fixed assets" crumbs={crumbs} />
        <NotAvailable feature="Fixed assets" source={sourceName(org)} />
      </>
    );
  }
  // Xero opens the register on Registered; StatusTabs treats "all" as "no ?status=".
  const status: AssetStatus = STATUSES.includes(query.status as AssetStatus)
    ? (query.status as AssetStatus)
    : 'registered';
  const page = Math.max(1, Number(query.page) || 1);
  const listPath = `${base}/accounting/assets`;
  const [result, details] = await Promise.all([
    connector.assets
      .list({ status, search: query.search, page, pageSize: 50 })
      .catch((error: unknown) => {
        // The Assets API needs its own scope in Xero; show why instead of failing the page.
        if (isConnectorError(error) && [401, 403].includes(error.status)) return error.message;
        throw error;
      }),
    connector.organisation().catch(() => undefined),
  ]);
  const currency = details?.baseCurrency;

  const columns: Column<FixedAsset>[] = [
    {
      key: 'name',
      header: 'Asset name',
      cell: (a) => <span className="text-ink font-medium">{a.name}</span>,
    },
    { key: 'number', header: 'Asset number', cell: (a) => a.number || '—' },
    {
      key: 'type',
      header: 'Asset type',
      cell: (a) => <span className="text-muted">{a.assetType ?? ''}</span>,
      hideOnMobile: true,
    },
    { key: 'date', header: 'Purchase date', cell: (a) => formatDate(a.purchaseDate) },
    {
      key: 'price',
      header: 'Purchase price',
      align: 'right',
      cell: (a) => <Money amount={a.purchasePrice} currency={currency} />,
    },
    ...(status === 'registered'
      ? [
          {
            key: 'book',
            header: 'Book value',
            align: 'right' as const,
            cell: (a: FixedAsset) => <Money amount={a.bookValue} currency={currency} />,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader title="Fixed assets" crumbs={crumbs} />
      <StatusTabs
        basePath={listPath}
        current={status}
        params={{ search: query.search }}
        tabs={[
          { value: 'draft', label: 'Draft' },
          { value: 'registered', label: 'Registered' },
          { value: 'disposed', label: 'Sold & disposed' },
        ].map((t) => ({
          ...t,
          count: typeof result !== 'string' && t.value === status ? result.total : undefined,
        }))}
      />
      {typeof result === 'string' ? (
        <ErrorPanel title="Fixed assets couldn't be loaded" message={result} />
      ) : (
        <>
          <SourceNote>{result.note}</SourceNote>
          <div className="mb-4">
            <SearchBox placeholder="Search assets" className="w-full max-w-md" />
          </div>
          <DataTable
            columns={columns}
            rows={result.items}
            rowKey={(a) => a.id}
            empty={
              <EmptyState
                icon={<Boxes className="h-6 w-6" />}
                title={
                  query.search
                    ? `No assets match “${query.search}”`
                    : status === 'disposed'
                      ? 'No sold or disposed assets'
                      : `No ${status} assets`
                }
              />
            }
          />
          <Pagination
            page={result.page}
            hasMore={result.hasMore}
            basePath={listPath}
            params={{ status, search: query.search }}
          />
        </>
      )}
    </>
  );
}
