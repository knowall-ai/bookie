import type { Item, ItemInput } from '@/lib/domain/types';
import type { ItemsModule } from '../../types';
import { ConnectorError } from '../../types';
import type { XeroClient } from '../client';
import { matchesSearch } from '../../search';

const DEFAULT_PAGE_SIZE = 50;

interface XeroItemDetails {
  UnitPrice?: number;
  AccountCode?: string;
  COGSAccountCode?: string;
  TaxType?: string;
}

export interface XeroItem {
  ItemID: string;
  Code: string;
  Name?: string;
  Description?: string;
  PurchaseDescription?: string;
  IsSold?: boolean;
  IsPurchased?: boolean;
  IsTrackedAsInventory?: boolean;
  QuantityOnHand?: number;
  SalesDetails?: XeroItemDetails;
  PurchaseDetails?: XeroItemDetails;
}

export function fromXeroItem(raw: XeroItem): Item {
  return {
    id: raw.ItemID,
    code: raw.Code,
    name: raw.Name || raw.Code,
    description: raw.Description || undefined,
    salePrice: raw.SalesDetails?.UnitPrice,
    salesAccountCode: raw.SalesDetails?.AccountCode || undefined,
    purchasePrice: raw.PurchaseDetails?.UnitPrice,
    purchaseAccountCode:
      raw.PurchaseDetails?.AccountCode || raw.PurchaseDetails?.COGSAccountCode || undefined,
    isSold: !!raw.IsSold,
    isPurchased: !!raw.IsPurchased,
    isTracked: !!raw.IsTrackedAsInventory,
    quantityOnHand: raw.IsTrackedAsInventory ? raw.QuantityOnHand : undefined,
  };
}

/** Xero marks an item sold/purchased when that side has details. */
export function toXeroItem(input: ItemInput, id?: string): Record<string, unknown> {
  const sold = input.salePrice !== undefined || !!input.salesAccountCode;
  const purchased = input.purchasePrice !== undefined || !!input.purchaseAccountCode;
  return {
    ...(id ? { ItemID: id } : {}),
    Code: input.code,
    Name: input.name,
    Description: input.description ?? '',
    IsSold: sold,
    IsPurchased: purchased,
    SalesDetails: sold
      ? { UnitPrice: input.salePrice, AccountCode: input.salesAccountCode || undefined }
      : undefined,
    PurchaseDetails: purchased
      ? { UnitPrice: input.purchasePrice, AccountCode: input.purchaseAccountCode || undefined }
      : undefined,
  };
}

export function xeroItems(client: XeroClient): ItemsModule | undefined {
  const save = async (body: Record<string, unknown>) => {
    const result = await client.request<{ Items: XeroItem[] }>('Items', {
      method: 'POST',
      body: { Items: [body] },
    });
    return fromXeroItem(result.Items[0]);
  };
  return {
    // Xero returns every item in one response (no paging), so page locally.
    async list(query) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const result = await client.request<{ Items: XeroItem[] }>('Items', {
        query: { order: 'Code ASC' },
      });
      const all = (result.Items ?? [])
        .map(fromXeroItem)
        .filter((i) => matchesSearch([i.code, i.name, i.description], query?.search));
      return {
        items: all.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        hasMore: all.length > page * pageSize,
        total: all.length,
      };
    },
    async get(id) {
      const result = await client.request<{ Items: XeroItem[] }>(`Items/${id}`);
      const raw = result.Items?.[0];
      if (!raw) throw new ConnectorError('Item not found.', 404, 'xero');
      return fromXeroItem(raw);
    },
    create: (input) => save(toXeroItem(input)),
    update: (id, input) => save(toXeroItem(input, id)),
  };
}
