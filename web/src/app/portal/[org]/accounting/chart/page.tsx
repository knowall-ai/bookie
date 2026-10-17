import { ListTree, Plus } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import type { Account, AccountClass } from '@/lib/domain/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusTabs } from '@/components/ui/StatusTabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { SearchBox } from '@/components/ui/SearchBox';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, NotAvailable } from '@/components/ui/States';

export const metadata = { title: 'Chart of accounts' };

/** Xero's tabs: All · Assets · Liabilities · Equity · Expenses · Revenue · Archive. */
const TABS: { value: string; label: string; class?: AccountClass }[] = [
  { value: 'all', label: 'All accounts' },
  { value: 'asset', label: 'Assets', class: 'asset' },
  { value: 'liability', label: 'Liabilities', class: 'liability' },
  { value: 'equity', label: 'Equity', class: 'equity' },
  { value: 'expense', label: 'Expenses', class: 'expense' },
  { value: 'revenue', label: 'Revenue', class: 'revenue' },
  { value: 'archived', label: 'Archive' },
];

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const [{ org: orgParam }, query] = await Promise.all([params, searchParams]);
  const { connector, base, org } = await orgContext(orgParam);
  const crumbs = [{ label: 'Accounting', href: `${base}/accounting` }];
  if (!connector.accounts) {
    return (
      <>
        <PageHeader title="Chart of accounts" crumbs={crumbs} />
        <NotAvailable feature="Chart of accounts" source={sourceName(org)} />
      </>
    );
  }

  const [accounts, taxRates, details] = await Promise.all([
    connector.accounts.list({ withBalances: true }),
    connector.taxRates?.list().catch(() => []) ?? [],
    connector.organisation().catch(() => undefined),
  ]);
  const taxNames = new Map(taxRates.map((t) => [t.taxType, t.name]));
  const status = TABS.some((t) => t.value === query.status) ? query.status! : 'all';
  const tab = TABS.find((t) => t.value === status)!;
  const needle = query.search?.toLowerCase();
  const rows = accounts.filter(
    (a) =>
      (status === 'archived' ? a.status === 'archived' : a.status === 'active') &&
      (!tab.class || a.class === tab.class) &&
      (!needle ||
        a.code.toLowerCase().includes(needle) ||
        a.name.toLowerCase().includes(needle) ||
        a.typeLabel.toLowerCase().includes(needle))
  );
  const counts = (t: (typeof TABS)[number]) =>
    accounts.filter((a) =>
      t.value === 'archived'
        ? a.status === 'archived'
        : a.status === 'active' && (!t.class || a.class === t.class)
    ).length;
  const showBalance = accounts.some((a) => a.balance !== undefined);
  const currency = details?.baseCurrency;

  const columns: Column<Account>[] = [
    {
      key: 'code',
      header: 'Code',
      cell: (a) => <span className="text-ink num font-medium">{a.code || '—'}</span>,
      className: 'w-24',
    },
    {
      key: 'name',
      header: 'Name',
      cell: (a) => (
        <span className="flex flex-col">
          <span className="text-ink">{a.name}</span>
          {a.description && (
            <span className="text-faint line-clamp-1 text-xs">{a.description}</span>
          )}
        </span>
      ),
    },
    { key: 'type', header: 'Type', cell: (a) => a.typeLabel },
    {
      key: 'tax',
      header: 'Tax rate',
      cell: (a) => (
        <span className="text-muted">
          {a.taxType ? (taxNames.get(a.taxType) ?? a.taxType) : ''}
        </span>
      ),
      hideOnMobile: true,
    },
    ...(showBalance
      ? [
          {
            key: 'ytd',
            header: 'YTD',
            align: 'right' as const,
            cell: (a: Account) => <Money amount={a.balance ?? 0} currency={currency} />,
          },
        ]
      : []),
  ];

  const chartPath = `${base}/accounting/chart`;
  const canCreate = !!connector.accounts.create;
  return (
    <>
      <PageHeader
        title="Chart of accounts"
        crumbs={crumbs}
        meta={
          showBalance ? 'YTD is the balance for the current financial year to date.' : undefined
        }
        actions={
          canCreate && (
            <ButtonLink href={`${chartPath}/new`} variant="primary">
              <Plus className="h-4 w-4" /> Add account
            </ButtonLink>
          )
        }
      />
      <StatusTabs
        basePath={chartPath}
        current={status}
        params={{ search: query.search }}
        tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: counts(t) }))}
      />
      <div className="mb-4">
        <SearchBox placeholder="Search by code, name or type" className="w-full max-w-md" />
      </div>
      <DataTable
        dense
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        empty={
          <EmptyState
            icon={<ListTree className="h-6 w-6" />}
            title={
              query.search
                ? `No accounts match “${query.search}”`
                : status === 'archived'
                  ? 'No archived accounts'
                  : 'No accounts here'
            }
          />
        }
      />
    </>
  );
}
