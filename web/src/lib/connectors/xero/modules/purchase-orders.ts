import type {
  PurchaseOrder,
  PurchaseOrderInput,
  PurchaseOrderStatus,
  PurchaseOrderStatusChange,
} from '@/lib/domain/types';
import type { PurchaseOrdersModule } from '../../types';
import { ConnectorError } from '../../types';
import { xeroDate, type XeroClient } from '../client';
import { matchesSearch } from '../../search';
import { fromXeroLineItem, toLineAmountTypes, toXeroLineItem, type XeroLineItem } from '../mappers';

const DEFAULT_PAGE_SIZE = 50;

export interface XeroPurchaseOrder {
  PurchaseOrderID: string;
  PurchaseOrderNumber?: string;
  Reference?: string;
  Contact: { ContactID: string; Name: string };
  Date?: string;
  DateString?: string;
  DeliveryDate?: string | null;
  DeliveryDateString?: string | null;
  Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'BILLED' | 'DELETED';
  LineAmountTypes?: 'Exclusive' | 'Inclusive' | 'NoTax';
  CurrencyCode?: string;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  LineItems?: XeroLineItem[];
}

const STATUS: Record<XeroPurchaseOrder['Status'], PurchaseOrderStatus> = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  AUTHORISED: 'authorised',
  BILLED: 'billed',
  DELETED: 'deleted',
};

const TO_XERO: Record<PurchaseOrderStatus, XeroPurchaseOrder['Status']> = {
  draft: 'DRAFT',
  submitted: 'SUBMITTED',
  authorised: 'AUTHORISED',
  billed: 'BILLED',
  deleted: 'DELETED',
};

export function fromXeroPurchaseOrder(raw: XeroPurchaseOrder): PurchaseOrder {
  return {
    id: raw.PurchaseOrderID,
    number: raw.PurchaseOrderNumber || '',
    reference: raw.Reference || undefined,
    contact: { id: raw.Contact.ContactID, name: raw.Contact.Name },
    date: xeroDate(raw.DateString ?? raw.Date) ?? '',
    deliveryDate: xeroDate(raw.DeliveryDateString ?? raw.DeliveryDate),
    status: STATUS[raw.Status] ?? 'draft',
    currency: raw.CurrencyCode ?? '',
    subTotal: raw.SubTotal ?? 0,
    totalTax: raw.TotalTax ?? 0,
    total: raw.Total ?? 0,
    lineItems: raw.LineItems?.map(fromXeroLineItem),
  };
}

export function toXeroPurchaseOrder(
  input: PurchaseOrderInput,
  id?: string
): Record<string, unknown> {
  return {
    ...(id ? { PurchaseOrderID: id } : {}),
    Contact: { ContactID: input.contactId },
    Date: input.date,
    DeliveryDate: input.deliveryDate,
    Reference: input.reference || undefined,
    CurrencyCode: input.currency || undefined,
    LineAmountTypes: toLineAmountTypes(input.lineAmountType),
    LineItems: input.lineItems.map(toXeroLineItem),
  };
}

/** Body for a status-only update: Xero moves the order on without touching its lines. */
export function toXeroPurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatusChange
): Record<string, unknown> {
  return { PurchaseOrderID: id, Status: TO_XERO[status] };
}

export function xeroPurchaseOrders(client: XeroClient): PurchaseOrdersModule | undefined {
  const save = async (body: Record<string, unknown>) => {
    const result = await client.request<{ PurchaseOrders: XeroPurchaseOrder[] }>('PurchaseOrders', {
      method: 'POST',
      body: { PurchaseOrders: [body] },
    });
    return fromXeroPurchaseOrder(result.PurchaseOrders[0]);
  };
  return {
    async list(query) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const result = await client.request<{ PurchaseOrders: XeroPurchaseOrder[] }>(
        'PurchaseOrders',
        {
          query: {
            Status:
              query?.status && query.status !== 'all'
                ? TO_XERO[query.status as PurchaseOrderStatus]
                : undefined,
            DateFrom: query?.from,
            DateTo: query?.to,
            order: 'Date DESC',
            page,
            pageSize,
          },
        }
      );
      const all = result.PurchaseOrders ?? [];
      // PurchaseOrders has no search term; filter the page we got.
      const items = all
        .map(fromXeroPurchaseOrder)
        .filter((p) => p.status !== 'deleted' || query?.status === 'deleted')
        .filter((p) => !query?.contactId || p.contact.id === query.contactId)
        .filter((p) => matchesSearch([p.number, p.reference, p.contact.name], query?.search));
      return { items, page, pageSize, hasMore: all.length >= pageSize };
    },
    async get(id) {
      const result = await client.request<{ PurchaseOrders: XeroPurchaseOrder[] }>(
        `PurchaseOrders/${id}`
      );
      const raw = result.PurchaseOrders?.[0];
      if (!raw) throw new ConnectorError('Purchase order not found.', 404, 'xero');
      return fromXeroPurchaseOrder(raw);
    },
    create: (input) => save({ ...toXeroPurchaseOrder(input), Status: 'DRAFT' }),
    update: (id, input) => save(toXeroPurchaseOrder(input, id)),
    setStatus: (id, status) => save(toXeroPurchaseOrderStatus(id, status)),
    statusChanges: ['submitted', 'authorised', 'billed', 'deleted'],
  };
}
