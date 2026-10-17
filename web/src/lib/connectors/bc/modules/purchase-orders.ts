import type { PurchaseOrder, PurchaseOrderInput, PurchaseOrderStatus } from '@/lib/domain/types';
import type { PurchaseOrdersModule } from '../../types';
import { ConnectorError } from '../../types';
import { odataString, type BcClient, type ODataList } from '../client';
import { bcDate, parseContactId } from '../index';
import { fromBcDocumentLine, toBcDocumentLine, type BcDocumentLine } from './document-lines';

const DEFAULT_PAGE_SIZE = 50;

export interface BcPurchaseOrder {
  id: string;
  number: string;
  orderDate?: string;
  requestedReceiptDate?: string;
  vendorId: string;
  vendorName: string;
  currencyCode?: string;
  status: string;
  fullyReceived?: boolean;
  totalAmountExcludingTax?: number;
  totalTaxAmount?: number;
  totalAmountIncludingTax?: number;
  purchaseOrderLines?: BcDocumentLine[];
}

/** BC purchase orders are Draft, In Review or Open (released); billed orders are removed. */
const STATUS: Record<string, PurchaseOrderStatus> = {
  Draft: 'draft',
  'In Review': 'submitted',
  Open: 'authorised',
};

const STATUS_FILTER: Partial<Record<PurchaseOrderStatus, string>> = {
  draft: "status eq 'Draft'",
  submitted: "status eq 'In Review'",
  authorised: "status eq 'Open'",
};

export function fromBcPurchaseOrder(raw: BcPurchaseOrder, lcy: string): PurchaseOrder {
  return {
    id: raw.id,
    number: raw.number,
    contact: { id: `v:${raw.vendorId}`, name: raw.vendorName },
    date: bcDate(raw.orderDate) ?? '',
    deliveryDate: bcDate(raw.requestedReceiptDate),
    status: STATUS[raw.status] ?? 'draft',
    currency: raw.currencyCode || lcy,
    subTotal: raw.totalAmountExcludingTax ?? 0,
    totalTax: raw.totalTaxAmount ?? 0,
    total: raw.totalAmountIncludingTax ?? 0,
    lineItems: raw.purchaseOrderLines?.map(fromBcDocumentLine),
  };
}

/** API v2.0 purchase orders have no reference field, so `reference` is not sent. */
export function toBcPurchaseOrder(input: PurchaseOrderInput) {
  return {
    vendorId: parseContactId(input.contactId).id,
    orderDate: input.date,
    requestedReceiptDate: input.deliveryDate,
    currencyCode: input.currency,
  };
}

export function bcPurchaseOrders(
  client: BcClient,
  lcy: () => Promise<string>
): PurchaseOrdersModule | undefined {
  const getRaw = (id: string) =>
    client.request<BcPurchaseOrder>(`purchaseOrders(${id})`, {
      query: { $expand: 'purchaseOrderLines' },
    });
  const writeLines = async (id: string, input: PurchaseOrderInput) => {
    for (const line of input.lineItems) {
      await client.request(`purchaseOrders(${id})/purchaseOrderLines`, {
        method: 'POST',
        body: toBcDocumentLine(line, 'directUnitCost'),
      });
    }
  };
  const mod: PurchaseOrdersModule = {
    async list(query) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const filters: string[] = [];
      const status = query?.status as PurchaseOrderStatus | undefined;
      if (status && status !== ('all' as PurchaseOrderStatus)) {
        const f = STATUS_FILTER[status];
        if (!f) return { items: [], page, pageSize, hasMore: false };
        filters.push(f);
      }
      if (query?.from) filters.push(`orderDate ge ${query.from}`);
      if (query?.to) filters.push(`orderDate le ${query.to}`);
      if (query?.contactId) filters.push(`vendorId eq ${parseContactId(query.contactId).id}`);
      if (query?.search) {
        const s = odataString(query.search);
        filters.push(`(contains(number,${s}) or contains(vendorName,${s}))`);
      }
      const result = await client.request<ODataList<BcPurchaseOrder>>('purchaseOrders', {
        query: {
          $filter: filters.join(' and ') || undefined,
          $orderby: 'orderDate desc,number desc',
          $top: pageSize + 1,
          $skip: (page - 1) * pageSize,
        },
      });
      const currency = await lcy();
      return {
        items: result.value.slice(0, pageSize).map((p) => fromBcPurchaseOrder(p, currency)),
        page,
        pageSize,
        hasMore: result.value.length > pageSize,
      };
    },
    async get(id) {
      return fromBcPurchaseOrder(await getRaw(id), await lcy());
    },
    async create(input) {
      const created = await client.request<{ id: string }>('purchaseOrders', {
        method: 'POST',
        body: toBcPurchaseOrder(input),
      });
      await writeLines(created.id, input);
      return mod.get(created.id);
    },
    async update(id, input) {
      const raw = await getRaw(id);
      if (raw.status !== 'Draft') {
        throw new ConnectorError(
          'Only draft purchase orders can be edited in Business Central.',
          409,
          'business-central'
        );
      }
      await client.request(`purchaseOrders(${id})`, {
        method: 'PATCH',
        etag: '*',
        body: toBcPurchaseOrder(input),
      });
      for (const line of raw.purchaseOrderLines ?? []) {
        await client.request(`purchaseOrders(${id})/purchaseOrderLines(${line.id})`, {
          method: 'DELETE',
          etag: '*',
        });
      }
      await writeLines(id, input);
      return mod.get(id);
    },
  };
  return mod;
}
