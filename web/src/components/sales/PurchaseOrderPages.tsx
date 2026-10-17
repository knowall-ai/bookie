import { notFound } from 'next/navigation';
import { Pencil, Plus, ShoppingCart } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { PurchaseOrder } from '@/lib/domain/types';
import { editorData } from '@/lib/portal/editor-data';
import { savePurchaseOrder } from '@/lib/portal/actions/purchase-orders';
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
import { DocumentFacts, DocumentLines, DocumentTotals } from '@/components/documents/DocumentParts';
import { DocumentEditor, type EditorPayload } from '@/components/documents/DocumentEditor';
import type { ListSearchParams } from '@/components/documents/InvoiceListPage';
import { toEditorLines } from './editor-lines';

/** Purchase orders say "Approved" where invoices say "Awaiting payment". */
function PoStatus({ status }: { status: PurchaseOrder['status'] }) {
  return <StatusBadge status={status === 'authorised' ? 'approved' : status} />;
}

const editableStatus = (s: PurchaseOrder['status']) => s === 'draft' || s === 'submitted';

export async function PurchaseOrderListPage({
  orgParam,
  searchParams,
}: {
  orgParam: string;
  searchParams: ListSearchParams;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  const crumbs = [{ label: 'Purchases', href: `${base}/purchases` }];
  if (!connector.purchaseOrders) {
    return (
      <>
        <PageHeader title="Purchase orders" crumbs={crumbs} />
        <NotAvailable feature="Purchase orders" source={sourceName(org)} />
      </>
    );
  }
  const status = searchParams.status ?? 'all';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const result = await connector.purchaseOrders.list({
    status,
    search: searchParams.search,
    page,
    pageSize: 50,
  });
  const listPath = `${base}/purchases/orders`;
  const canCreate = !!connector.purchaseOrders.create;

  const columns: Column<PurchaseOrder>[] = [
    {
      key: 'number',
      header: 'Number',
      cell: (p) => <span className="text-ink font-medium">{p.number || '—'}</span>,
    },
    {
      key: 'ref',
      header: 'Ref',
      cell: (p) => <span className="text-muted">{p.reference ?? ''}</span>,
      hideOnMobile: true,
    },
    {
      key: 'contact',
      header: 'To',
      cell: (p) => <span className="text-ink">{p.contact.name}</span>,
    },
    { key: 'date', header: 'Date', cell: (p) => formatDate(p.date), hideOnMobile: true },
    {
      key: 'delivery',
      header: 'Delivery date',
      cell: (p) => formatDate(p.deliveryDate),
      hideOnMobile: true,
    },
    {
      key: 'total',
      header: 'Amount',
      align: 'right',
      cell: (p) => <Money amount={p.total} currency={p.currency} className="text-ink" />,
    },
    { key: 'status', header: 'Status', cell: (p) => <PoStatus status={p.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Purchase orders"
        crumbs={crumbs}
        actions={
          canCreate && (
            <ButtonLink href={`${listPath}/new`} variant="primary">
              <Plus className="h-4 w-4" /> New purchase order
            </ButtonLink>
          )
        }
      />
      <StatusTabs
        basePath={listPath}
        current={status}
        params={{ search: searchParams.search }}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'draft', label: 'Draft' },
          { value: 'submitted', label: 'Awaiting approval' },
          { value: 'authorised', label: 'Approved' },
          { value: 'billed', label: 'Billed' },
        ]}
      />
      <div className="mb-4 flex items-center gap-3">
        <SearchBox
          placeholder="Search purchase orders by number, reference or supplier"
          className="w-full max-w-md"
        />
      </div>
      <DataTable
        columns={columns}
        rows={result.items}
        rowKey={(p) => p.id}
        rowHref={(p) => `${listPath}/${encodeURIComponent(p.id)}`}
        empty={
          <EmptyState
            icon={<ShoppingCart className="h-6 w-6" />}
            title={
              searchParams.search
                ? `No purchase orders match “${searchParams.search}”`
                : status === 'all'
                  ? 'No purchase orders here yet'
                  : 'No purchase orders with this status'
            }
            action={
              canCreate && (
                <ButtonLink href={`${listPath}/new`} variant="primary">
                  New purchase order
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
        params={{ status: searchParams.status, search: searchParams.search }}
      />
    </>
  );
}

export async function PurchaseOrderDetailPage({ orgParam, id }: { orgParam: string; id: string }) {
  const { connector, base } = await orgContext(orgParam);
  const mod = connector.purchaseOrders;
  if (!mod) notFound();
  const order = await mod.get(decodeURIComponent(id)).catch((error) => {
    if (isConnectorError(error) && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  });
  if (order.status === 'deleted') notFound();
  const listPath = `${base}/purchases/orders`;
  const editable = editableStatus(order.status) && !!mod.update;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Purchases', href: `${base}/purchases` },
          { label: 'Purchase orders', href: listPath },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Purchase order {order.number}
            <PoStatus status={order.status} />
          </span>
        }
        actions={
          editable && (
            <ButtonLink href={`${listPath}/${encodeURIComponent(order.id)}/edit`} size="sm">
              <Pencil className="h-4 w-4" /> Edit
            </ButtonLink>
          )
        }
      />
      <div className="space-y-5">
        <DocumentFacts
          facts={[
            { label: 'To', value: order.contact.name },
            { label: 'Date', value: formatDate(order.date) },
            { label: 'Delivery date', value: formatDate(order.deliveryDate) },
            { label: 'Order number', value: order.number || '—' },
            { label: 'Reference', value: order.reference || '—' },
          ]}
        />
        <DocumentLines lines={order.lineItems ?? []} currency={order.currency} />
        <DocumentTotals
          currency={order.currency}
          rows={[
            { label: 'Subtotal', amount: order.subTotal },
            { label: 'Total tax', amount: order.totalTax, muted: true },
            { label: 'Total', amount: order.total, strong: true },
          ]}
        />
      </div>
    </>
  );
}

export async function PurchaseOrderEditorPage({ orgParam, id }: { orgParam: string; id?: string }) {
  const { connector, base, org } = await orgContext(orgParam);
  const mod = connector.purchaseOrders;
  if (!mod || !(id ? mod.update : mod.create)) notFound();
  const existing = id
    ? await mod.get(decodeURIComponent(id)).catch((error) => {
        if (isConnectorError(error) && (error.status === 404 || error.status === 400)) notFound();
        throw error;
      })
    : undefined;
  if (existing && !editableStatus(existing.status)) notFound();
  const [details, data] = await Promise.all([
    connector.organisation(),
    editorData(connector, 'purchase'),
  ]);
  const listPath = `${base}/purchases/orders`;
  const orgKey = org.key;
  const orderId = existing?.id;

  async function save(payload: EditorPayload) {
    'use server';
    return savePurchaseOrder(orgKey, orderId, {
      contactId: payload.contactId,
      date: payload.date,
      deliveryDate: payload.dueDate,
      reference: payload.reference,
      lineAmountType: payload.lineAmountType,
      lineItems: payload.lineItems,
    });
  }

  return (
    <DocumentEditor
      heading={existing ? `Edit purchase order ${existing.number}` : 'New purchase order'}
      currency={existing?.currency ?? details.baseCurrency}
      contactLabel="Supplier"
      dateLabel="Date"
      secondDateLabel="Delivery date"
      docType="purchase"
      save={save}
      cancelHref={existing ? `${listPath}/${encodeURIComponent(existing.id)}` : listPath}
      savedHref={listPath}
      initial={
        existing && {
          contactId: existing.contact.id,
          date: existing.date,
          dueDate: existing.deliveryDate,
          reference: existing.reference,
          lineAmountType: 'exclusive',
          lineItems: toEditorLines(existing.lineItems),
        }
      }
      {...data}
    />
  );
}
