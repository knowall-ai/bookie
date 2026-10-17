import type { Item, ItemInput } from '@/lib/domain/types';
import type { ItemsModule } from '../../types';
import { odataString, type BcClient, type ODataList } from '../client';

const DEFAULT_PAGE_SIZE = 50;

export interface BcItem {
  id: string;
  number: string;
  displayName?: string;
  displayName2?: string;
  type?: 'Inventory' | 'Service' | 'Non-Inventory' | string;
  blocked?: boolean;
  inventory?: number;
  unitPrice?: number;
  unitCost?: number;
}

/**
 * BC items are sold and purchased through posting groups, not per-item
 * accounts, so the account codes stay empty. Blocked items are hidden.
 */
export function fromBcItem(raw: BcItem): Item {
  const tracked = raw.type === 'Inventory';
  return {
    id: raw.id,
    code: raw.number,
    name: raw.displayName || raw.number,
    description: raw.displayName2 || undefined,
    salePrice: raw.unitPrice,
    purchasePrice: raw.unitCost,
    isSold: true,
    isPurchased: true,
    isTracked: tracked,
    quantityOnHand: tracked ? raw.inventory : undefined,
  };
}

export function toBcItem(input: ItemInput) {
  return {
    number: input.code,
    displayName: input.name,
    displayName2: input.description ?? '',
    unitPrice: input.salePrice,
    unitCost: input.purchasePrice,
  };
}

export function bcItems(client: BcClient): ItemsModule | undefined {
  return {
    perItemAccounts: false,
    async list(query) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const filters = ['blocked eq false'];
      if (query?.search) {
        const s = odataString(query.search);
        filters.push(`(contains(number,${s}) or contains(displayName,${s}))`);
      }
      const result = await client.request<ODataList<BcItem>>('items', {
        query: {
          $filter: filters.join(' and '),
          $orderby: 'number',
          $top: pageSize + 1,
          $skip: (page - 1) * pageSize,
        },
      });
      return {
        items: result.value.slice(0, pageSize).map(fromBcItem),
        page,
        pageSize,
        hasMore: result.value.length > pageSize,
      };
    },
    get: async (id) => fromBcItem(await client.request<BcItem>(`items(${id})`)),
    create: async (input) =>
      fromBcItem(await client.request<BcItem>('items', { method: 'POST', body: toBcItem(input) })),
    update: async (id, input) =>
      fromBcItem(
        await client.request<BcItem>(`items(${id})`, {
          method: 'PATCH',
          etag: '*',
          body: toBcItem(input),
        })
      ),
  };
}
