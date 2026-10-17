import type { PurchaseOrder, PurchaseOrderInput, PurchaseOrderStatus } from '@/lib/domain/types';
import { addDays, DEMO_TODAY, type DemoData } from '../data';
import type { PurchaseOrdersModule } from '../../types';
import { ConnectorError } from '../../types';
import { demoId, matches, notFound, paginate } from '../index';
import { catalogueLine, contactOf, priceLines, totals } from './documents';

/** [supplier index, days ago, status, reference, lines as [item index, qty]] */
const FIXTURES: [number, number, PurchaseOrderStatus, string | undefined, [number, number][]][] = [
  [
    0,
    1,
    'draft',
    'Winter green beans',
    [
      [0, 200],
      [1, 150],
    ],
  ],
  [2, 3, 'draft', 'Retail bags 1kg', [[2, 400]]],
  [0, 5, 'submitted', 'Decaf lot', [[2, 80]]],
  [1, 9, 'authorised', 'Pallet freight', [[1, 60]]],
  [2, 14, 'authorised', 'Gift boxes', [[0, 120]]],
  [0, 28, 'billed', 'Autumn green beans', [[0, 250]]],
  [2, 45, 'billed', 'Labels and sleeves', [[1, 90]]],
];

const state = new WeakMap<DemoData, PurchaseOrder[]>();

function ordersOf(data: DemoData): PurchaseOrder[] {
  const hit = state.get(data);
  if (hit) return hit;
  const today = DEMO_TODAY();
  const suppliers = data.contacts.filter((c) => c.isSupplier);
  const orders = FIXTURES.map(([who, ago, status, reference, lines], i) => {
    const contact = suppliers[who % suppliers.length];
    const date = addDays(today, -ago);
    const lineItems = priceLines(
      lines.map(([item, qty]) =>
        catalogueLine(data.items[item % data.items.length], qty, 'purchase')
      ),
      'purchase'
    );
    return {
      id: `po-${String(i + 1).padStart(4, '0')}`,
      number: `PO-${String(460 - i).padStart(4, '0')}`,
      reference,
      contact: { id: contact.id, name: contact.name },
      date,
      deliveryDate: addDays(date, 14),
      status,
      currency: 'GBP',
      ...totals(lineItems),
      lineItems,
    } satisfies PurchaseOrder;
  });
  state.set(data, orders);
  return orders;
}

export function demoPurchaseOrders(data: DemoData): PurchaseOrdersModule | undefined {
  const find = (id: string) =>
    ordersOf(data).find((p) => p.id === id) ?? notFound('Purchase order');
  const build = (
    input: PurchaseOrderInput,
    base: Pick<PurchaseOrder, 'id' | 'number' | 'status'>
  ) => {
    const contact = contactOf(data, input.contactId);
    const lineItems = priceLines(input.lineItems, 'purchase');
    return {
      ...base,
      reference: input.reference,
      contact: { id: contact.id, name: contact.name },
      date: input.date,
      deliveryDate: input.deliveryDate,
      currency: 'GBP',
      ...totals(lineItems),
      lineItems,
    } satisfies PurchaseOrder;
  };
  return {
    async list(query) {
      const all = ordersOf(data)
        .filter(
          (p) =>
            (!query?.status || query.status === 'all'
              ? p.status !== 'deleted'
              : p.status === query.status) &&
            (!query?.contactId || p.contact.id === query.contactId) &&
            (!query?.from || p.date >= query.from) &&
            (!query?.to || p.date <= query.to) &&
            matches([p.number, p.reference, p.contact.name], query?.search)
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
      return paginate(
        structuredClone(all).map(({ lineItems: _l, ...rest }) => rest),
        query
      );
    },
    get: async (id) => structuredClone(find(id)),
    async create(input) {
      const orders = ordersOf(data);
      const next = Math.max(...orders.map((p) => Number(p.number.slice(3)) || 0)) + 1;
      const order = build(input, {
        id: demoId('po'),
        number: `PO-${String(next).padStart(4, '0')}`,
        status: 'draft',
      });
      orders.unshift(order);
      return structuredClone(order);
    },
    async update(id, input) {
      const existing = find(id);
      if (existing.status !== 'draft' && existing.status !== 'submitted') {
        throw new ConnectorError('Only draft purchase orders can be edited.', 409, 'demo');
      }
      Object.assign(existing, build(input, existing));
      return structuredClone(existing);
    },
  };
}
