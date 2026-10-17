import { notFound } from 'next/navigation';
import { Package, Pencil, Plus } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { Item, ItemInput } from '@/lib/domain/types';
import { saveItem } from '@/lib/portal/actions/items';
import { formatNumber } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/ui/SearchBox';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, NotAvailable } from '@/components/ui/States';
import { ItemForm } from './ItemForm';

const crumbsFor = (base: string) => [
  { label: 'Sales', href: `${base}/sales` },
  { label: 'Products and services', href: `${base}/sales/products` },
];

export async function ProductListPage({
  orgParam,
  searchParams,
}: {
  orgParam: string;
  searchParams: { search?: string; page?: string };
}) {
  const { connector, base, org } = await orgContext(orgParam);
  const crumbs = [{ label: 'Sales', href: `${base}/sales` }];
  if (!connector.items) {
    return (
      <>
        <PageHeader title="Products and services" crumbs={crumbs} />
        <NotAvailable feature="Products and services" source={sourceName(org)} />
      </>
    );
  }
  const page = Math.max(1, Number(searchParams.page) || 1);
  const result = await connector.items.list({ search: searchParams.search, page, pageSize: 50 });
  const listPath = `${base}/sales/products`;
  const canCreate = !!connector.items.create;
  const tracked = result.items.some((i) => i.isTracked);

  const columns: Column<Item>[] = [
    {
      key: 'code',
      header: 'Code',
      cell: (i) => <span className="text-ink font-medium">{i.code}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      cell: (i) => (
        <span className="min-w-0">
          <span className="text-ink block">{i.name}</span>
          {i.description && i.description !== i.name && (
            <span className="text-faint block max-w-md truncate text-xs">{i.description}</span>
          )}
        </span>
      ),
    },
    {
      key: 'cost',
      header: 'Cost price',
      align: 'right',
      cell: (i) =>
        i.isPurchased ? <Money amount={i.purchasePrice} /> : <span className="text-faint">—</span>,
      hideOnMobile: true,
    },
    {
      key: 'sale',
      header: 'Sale price',
      align: 'right',
      cell: (i) =>
        i.isSold ? (
          <Money amount={i.salePrice} className="text-ink" />
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    ...(tracked
      ? [
          {
            key: 'qty',
            header: 'Quantity',
            align: 'right' as const,
            cell: (i: Item) =>
              i.isTracked ? (
                <span className="num">{formatNumber(i.quantityOnHand ?? 0, 4)}</span>
              ) : (
                ''
              ),
            hideOnMobile: true,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Products and services"
        crumbs={crumbs}
        actions={
          canCreate && (
            <ButtonLink href={`${listPath}/new`} variant="primary">
              <Plus className="h-4 w-4" /> New item
            </ButtonLink>
          )
        }
      />
      <div className="mb-4 flex items-center gap-3">
        <SearchBox placeholder="Search items by code or name" className="w-full max-w-md" />
        {result.total !== undefined && (
          <span className="text-muted text-sm">
            {result.total} {result.total === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={result.items}
        rowKey={(i) => i.id}
        rowHref={(i) => `${listPath}/${encodeURIComponent(i.id)}`}
        empty={
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title={
              searchParams.search
                ? `No items match “${searchParams.search}”`
                : 'No products or services yet'
            }
            body={
              searchParams.search
                ? undefined
                : 'Add the things you buy and sell so invoices and bills fill in prices and accounts for you.'
            }
            action={
              canCreate && (
                <ButtonLink href={`${listPath}/new`} variant="primary">
                  New item
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
        params={{ search: searchParams.search }}
      />
    </>
  );
}

async function loadItem(orgParam: string, id: string) {
  const ctx = await orgContext(orgParam);
  if (!ctx.connector.items) notFound();
  const item = await ctx.connector.items.get(decodeURIComponent(id)).catch((error) => {
    if (isConnectorError(error) && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  });
  return { ...ctx, item, mod: ctx.connector.items };
}

export async function ProductDetailPage({ orgParam, id }: { orgParam: string; id: string }) {
  const { base, item, mod, connector } = await loadItem(orgParam, id);
  const chart = (await connector.accounts?.list().catch(() => [])) ?? [];
  const accountLabel = (code?: string) => {
    if (!code) return '—';
    const account = chart.find((a) => a.code === code);
    return account ? `${code} · ${account.name}` : code;
  };
  const listPath = `${base}/sales/products`;
  const accounts = mod.perItemAccounts !== false;

  const side = (title: string, enabled: boolean, price: number | undefined, account?: string) => (
    <Card>
      <CardHeader
        title={title}
        action={<Badge tone={enabled ? 'green' : 'neutral'}>{enabled ? 'Yes' : 'No'}</Badge>}
      />
      {enabled ? (
        <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
          <div>
            <dt className="text-faint text-xs font-semibold tracking-wide uppercase">
              {title.startsWith('Sales') ? 'Sale price' : 'Cost price'}
            </dt>
            <dd className="text-ink mt-1">
              <Money amount={price} />
            </dd>
          </div>
          {accounts && (
            <div>
              <dt className="text-faint text-xs font-semibold tracking-wide uppercase">Account</dt>
              <dd className="text-ink mt-1">{accountLabel(account)}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-muted p-5 text-sm">
          Not used on {title.startsWith('Sales') ? 'sales' : 'purchases'}.
        </p>
      )}
    </Card>
  );

  return (
    <>
      <PageHeader
        crumbs={crumbsFor(base)}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {item.name}
            <span className="text-muted text-base font-normal">{item.code}</span>
          </span>
        }
        meta={item.description}
        actions={
          mod.update && (
            <ButtonLink href={`${listPath}/${encodeURIComponent(item.id)}/edit`} size="sm">
              <Pencil className="h-4 w-4" /> Edit
            </ButtonLink>
          )
        }
      />
      <div className="grid gap-5 md:grid-cols-2">
        {side('Purchases', item.isPurchased, item.purchasePrice, item.purchaseAccountCode)}
        {side('Sales', item.isSold, item.salePrice, item.salesAccountCode)}
        {item.isTracked && (
          <Card className="md:col-span-2">
            <CardHeader title="Inventory" subtitle="This item is tracked" />
            <p className="p-5 text-sm">
              <span className="text-muted">Quantity on hand: </span>
              <span className="num text-ink font-semibold">
                {formatNumber(item.quantityOnHand ?? 0, 4)}
              </span>
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

export async function ProductEditorPage({ orgParam, id }: { orgParam: string; id?: string }) {
  const { connector, base, org } = await orgContext(orgParam);
  const mod = connector.items;
  if (!mod || !(id ? mod.update : mod.create)) notFound();
  const existing = id ? (await loadItem(orgParam, id)).item : undefined;
  const accounts = (await connector.accounts?.list().catch(() => [])) ?? [];
  const listPath = `${base}/sales/products`;
  const orgKey = org.key;
  const itemId = existing?.id;

  async function save(input: ItemInput) {
    'use server';
    return saveItem(orgKey, itemId, input);
  }

  return (
    <ItemForm
      heading={existing ? `Edit ${existing.code}` : 'New item'}
      accounts={accounts
        .filter((a) => a.status === 'active' && !a.isBank)
        .map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))}
      accountsSupported={mod.perItemAccounts !== false}
      save={save}
      cancelHref={existing ? `${listPath}/${encodeURIComponent(existing.id)}` : listPath}
      savedHref={listPath}
      initial={
        existing && {
          code: existing.code,
          name: existing.name,
          description: existing.description ?? '',
          sells: existing.isSold,
          salePrice: existing.salePrice?.toString() ?? '',
          salesAccountCode: existing.salesAccountCode ?? '',
          buys: existing.isPurchased,
          purchasePrice: existing.purchasePrice?.toString() ?? '',
          purchaseAccountCode: existing.purchaseAccountCode ?? '',
        }
      }
    />
  );
}
