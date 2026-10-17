import type { Item, ItemInput } from '@/lib/domain/types';
import type { DemoData } from '../data';
import type { ItemsModule } from '../../types';
import { ConnectorError } from '../../types';
import { demoId, matches, notFound, paginate } from '../index';

/** Extra fictional catalogue entries, added once per demo org on top of `data.items`. */
const EXTRA: Item[] = [
  {
    id: 'item-6',
    code: 'COLD-BREW',
    name: 'Cold brew concentrate 5L',
    description: 'Ready-to-dilute cold brew, 1:4',
    salePrice: 38,
    purchasePrice: 15,
    salesAccountCode: '200',
    purchaseAccountCode: '310',
    isSold: true,
    isPurchased: true,
    isTracked: true,
    quantityOnHand: 42,
  },
  {
    id: 'item-7',
    code: 'CUPS-12OZ',
    name: 'Compostable cups 12oz (box of 1,000)',
    purchasePrice: 64,
    purchaseAccountCode: '310',
    isSold: false,
    isPurchased: true,
  },
];

const seeded = new WeakSet<DemoData>();

function itemsOf(data: DemoData): Item[] {
  if (!seeded.has(data)) {
    for (const extra of EXTRA) {
      if (!data.items.some((i) => i.id === extra.id)) data.items.push(structuredClone(extra));
    }
    seeded.add(data);
  }
  return data.items;
}

function fromInput(input: ItemInput) {
  return {
    code: input.code,
    name: input.name,
    description: input.description,
    salePrice: input.salePrice,
    salesAccountCode: input.salesAccountCode,
    purchasePrice: input.purchasePrice,
    purchaseAccountCode: input.purchaseAccountCode,
    isSold: input.salePrice !== undefined || !!input.salesAccountCode,
    isPurchased: input.purchasePrice !== undefined || !!input.purchaseAccountCode,
  };
}

export function demoItems(data: DemoData): ItemsModule | undefined {
  const find = (id: string) => itemsOf(data).find((i) => i.id === id) ?? notFound('Item');
  const assertUniqueCode = (code: string, id?: string) => {
    if (itemsOf(data).some((i) => i.code.toLowerCase() === code.toLowerCase() && i.id !== id)) {
      throw new ConnectorError(`An item with code ${code} already exists.`, 409, 'demo');
    }
  };
  return {
    async list(query) {
      const all = itemsOf(data)
        .filter((i) => matches([i.code, i.name, i.description], query?.search))
        .sort((a, b) => a.code.localeCompare(b.code));
      return paginate(structuredClone(all), query);
    },
    get: async (id) => structuredClone(find(id)),
    async create(input) {
      assertUniqueCode(input.code);
      const item: Item = { id: demoId('item'), ...fromInput(input) };
      itemsOf(data).push(item);
      return structuredClone(item);
    },
    async update(id, input) {
      const item = find(id);
      assertUniqueCode(input.code, id);
      Object.assign(item, fromInput(input));
      return structuredClone(item);
    },
  };
}
