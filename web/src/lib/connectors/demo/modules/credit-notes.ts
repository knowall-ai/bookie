import type { CreditNote, CreditNoteType, InvoiceStatus } from '@/lib/domain/types';
import { addDays, DEMO_TODAY, type DemoData } from '../data';
import type { CreditNotesModule } from '../../types';
import { matches, notFound, paginate } from '../index';
import { catalogueLine, priceLines, totals } from './documents';

/** [type, party index, days ago, status, share of credit left, reference, lines] */
const FIXTURES: [
  CreditNoteType,
  number,
  number,
  InvoiceStatus,
  number,
  string | undefined,
  [number, number][],
][] = [
  ['sales', 1, 3, 'draft', 1, 'Damaged in transit', [[0, 2]]],
  ['sales', 0, 11, 'authorised', 1, 'Short delivery', [[1, 4]]],
  ['sales', 4, 24, 'authorised', 0.5, 'Price adjustment', [[0, 10]]],
  ['sales', 6, 47, 'paid', 0, 'Returned decaf', [[2, 6]]],
  ['sales', 3, 90, 'voided', 0, undefined, [[3, 1]]],
  ['purchase', 0, 8, 'authorised', 1, 'Green beans quality claim', [[0, 15]]],
  ['purchase', 2, 30, 'paid', 0, 'Over-billed boxes', [[1, 20]]],
];

const state = new WeakMap<DemoData, CreditNote[]>();

function creditNotesOf(data: DemoData): CreditNote[] {
  const hit = state.get(data);
  if (hit) return hit;
  const today = DEMO_TODAY();
  const customers = data.contacts.filter((c) => c.isCustomer);
  const suppliers = data.contacts.filter((c) => c.isSupplier);
  let sales = 0;
  let purchases = 0;
  const notes = FIXTURES.map(([type, who, ago, status, left, reference, lines], i) => {
    const parties = type === 'sales' ? customers : suppliers;
    const contact = parties[who % parties.length];
    const lineItems = priceLines(
      lines.map(([item, qty]) => catalogueLine(data.items[item % data.items.length], qty, type)),
      type
    );
    const sums = totals(lineItems);
    const number =
      type === 'sales' ? `CN-${String(88 - sales++).padStart(4, '0')}` : `SCN-${31 - purchases++}`;
    return {
      id: `cn-${String(i + 1).padStart(4, '0')}`,
      type,
      number,
      reference,
      contact: { id: contact.id, name: contact.name },
      date: addDays(today, -ago),
      status,
      currency: 'GBP',
      ...sums,
      remainingCredit: Math.round(sums.total * left * 100) / 100,
      lineItems,
    } satisfies CreditNote;
  });
  state.set(data, notes);
  return notes;
}

export function demoCreditNotes(data: DemoData): CreditNotesModule | undefined {
  return {
    async list(type, query) {
      const all = creditNotesOf(data)
        .filter(
          (c) =>
            c.type === type &&
            (!query?.status || query.status === 'all'
              ? c.status !== 'voided' && c.status !== 'deleted'
              : c.status === query.status) &&
            (!query?.contactId || c.contact.id === query.contactId) &&
            (!query?.from || c.date >= query.from) &&
            (!query?.to || c.date <= query.to) &&
            matches([c.number, c.reference, c.contact.name], query?.search)
        )
        .sort((a, b) => b.date.localeCompare(a.date));
      return paginate(
        structuredClone(all).map(({ lineItems: _l, ...rest }) => rest),
        query
      );
    },
    async get(id) {
      return structuredClone(
        creditNotesOf(data).find((c) => c.id === id) ?? notFound('Credit note')
      );
    },
  };
}
