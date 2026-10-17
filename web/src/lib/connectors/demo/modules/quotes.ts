import type { Quote, QuoteInput, QuoteStatus } from '@/lib/domain/types';
import { addDays, DEMO_TODAY, type DemoData, type DemoInvoice } from '../data';
import type { QuotesModule, QuoteStatusChange } from '../../types';
import { ConnectorError } from '../../types';
import { demoId, matches, notFound, paginate } from '../index';
import { catalogueLine, contactOf, priceLines, totals } from './documents';

const TERMS =
  'Prices are valid for 30 days. Delivery within 5 working days of order. Payment due 30 days from invoice.';

/** [customer index, days ago, status, title, lines as [item index, qty]] */
const FIXTURES: [number, number, QuoteStatus, string, [number, number][]][] = [
  [
    0,
    2,
    'draft',
    'Breakfast service coffee supply',
    [
      [0, 40],
      [2, 10],
    ],
  ],
  [
    5,
    4,
    'draft',
    'Café opening package',
    [
      [0, 12],
      [3, 1],
      [4, 1],
    ],
  ],
  [
    1,
    6,
    'sent',
    'Quarterly espresso contract',
    [
      [0, 60],
      [1, 30],
    ],
  ],
  [3, 9, 'sent', 'Staff room coffee', [[1, 8]]],
  [
    7,
    12,
    'sent',
    'Bakery counter blend',
    [
      [0, 20],
      [2, 6],
    ],
  ],
  [2, 15, 'accepted', 'Barista training for new staff', [[3, 2]]],
  [4, 20, 'accepted', 'Import pallet: filter roast', [[1, 120]]],
  [6, 26, 'declined', 'Office coffee machine service', [[4, 3]]],
  [
    0,
    33,
    'declined',
    'Conference week supply',
    [
      [0, 30],
      [1, 30],
    ],
  ],
  [
    1,
    40,
    'invoiced',
    'Autumn restock',
    [
      [0, 50],
      [2, 20],
    ],
  ],
  [
    5,
    52,
    'invoiced',
    'Grinder service and beans',
    [
      [4, 1],
      [0, 10],
    ],
  ],
  [2, 61, 'invoiced', 'Training refresher', [[3, 1]]],
];

const state = new WeakMap<DemoData, Quote[]>();

function seed(data: DemoData): Quote[] {
  const today = DEMO_TODAY();
  const customers = data.contacts.filter((c) => c.isCustomer);
  return FIXTURES.map(([who, ago, status, title, lines], i) => {
    const contact = customers[who % customers.length];
    const date = addDays(today, -ago);
    const lineItems = priceLines(
      lines.map(([item, qty]) => catalogueLine(data.items[item % data.items.length], qty, 'sales')),
      'sales'
    );
    return {
      id: `quote-${String(i + 1).padStart(4, '0')}`,
      number: `QU-${String(240 - i).padStart(4, '0')}`,
      reference: i % 3 === 0 ? `RFQ ${7100 + i * 7}` : undefined,
      title,
      summary: `Prepared for ${contact.name}`,
      terms: TERMS,
      contact: { id: contact.id, name: contact.name },
      date,
      expiryDate: addDays(date, 30),
      status,
      currency: 'GBP',
      lineAmountType: 'exclusive',
      ...totals(lineItems),
      lineItems,
    } satisfies Quote;
  });
}

function quotesOf(data: DemoData) {
  let quotes = state.get(data);
  if (!quotes) {
    quotes = seed(data);
    state.set(data, quotes);
  }
  return quotes;
}

/** Legal status changes, mirroring Xero's quote lifecycle. */
const TRANSITIONS: Record<QuoteStatusChange, QuoteStatus[]> = {
  sent: ['draft', 'accepted', 'declined'],
  accepted: ['sent'],
  declined: ['sent'],
  deleted: ['draft', 'sent'],
};

export function demoQuotes(data: DemoData): QuotesModule | undefined {
  const find = (id: string) => quotesOf(data).find((q) => q.id === id) ?? notFound('Quote');
  const build = (input: QuoteInput, id: string, number: string, status: QuoteStatus): Quote => {
    const contact = contactOf(data, input.contactId);
    const lineItems = priceLines(input.lineItems, 'sales');
    return {
      id,
      number,
      reference: input.reference,
      title: input.title,
      summary: input.summary,
      terms: input.terms,
      contact: { id: contact.id, name: contact.name },
      date: input.date,
      expiryDate: input.expiryDate ?? addDays(input.date, 30),
      status,
      currency: 'GBP',
      lineAmountType: input.lineAmountType ?? 'exclusive',
      ...totals(lineItems),
      lineItems,
    };
  };

  return {
    async list(query) {
      const all = quotesOf(data)
        .filter(
          (q) =>
            (!query?.status || query.status === 'all'
              ? q.status !== 'deleted'
              : q.status === query.status) &&
            (!query?.contactId || q.contact.id === query.contactId) &&
            (!query?.from || q.date >= query.from) &&
            (!query?.to || q.date <= query.to) &&
            matches([q.number, q.reference, q.title, q.contact.name], query?.search)
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
      return paginate(
        structuredClone(all).map(({ lineItems: _l, ...rest }) => rest),
        query
      );
    },
    get: async (id) => structuredClone(find(id)),
    async create(input) {
      const quotes = quotesOf(data);
      const next = Math.max(...quotes.map((q) => Number(q.number.slice(3)) || 0)) + 1;
      const quote = build(
        input,
        demoId('quote'),
        input.number || `QU-${String(next).padStart(4, '0')}`,
        'draft'
      );
      quotes.unshift(quote);
      return structuredClone(quote);
    },
    async update(id, input) {
      const existing = find(id);
      if (existing.status !== 'draft' && existing.status !== 'sent') {
        throw new ConnectorError('Only draft or sent quotes can be edited.', 409, 'demo');
      }
      Object.assign(existing, build(input, id, input.number || existing.number, existing.status));
      return structuredClone(existing);
    },
    statusChanges: ['sent', 'accepted', 'declined', 'deleted'],
    async setStatus(id, status) {
      const quote = find(id);
      if (!TRANSITIONS[status].includes(quote.status)) {
        throw new ConnectorError(
          `A ${quote.status} quote can't be marked as ${status}.`,
          409,
          'demo'
        );
      }
      quote.status = status;
      return structuredClone(quote);
    },
    convertibleStatuses: ['sent', 'accepted'],
    async convertToInvoice(id) {
      const quote = find(id);
      if (quote.status !== 'sent' && quote.status !== 'accepted') {
        throw new ConnectorError('Only sent or accepted quotes can be invoiced.', 409, 'demo');
      }
      const count = data.invoices.filter((i) => i.type === 'sales').length;
      const date = DEMO_TODAY();
      const invoice: DemoInvoice = {
        id: demoId('inv'),
        type: 'sales',
        number: `INV-${String(1100 + count).padStart(4, '0')}`,
        reference: quote.number,
        contact: { ...quote.contact },
        date,
        dueDate: addDays(date, 30),
        status: 'draft',
        currency: quote.currency,
        lineAmountType: quote.lineAmountType,
        subTotal: quote.subTotal,
        totalTax: quote.totalTax,
        total: quote.total,
        amountDue: quote.total,
        amountPaid: 0,
        isOverdue: false,
        lineItems: structuredClone(quote.lineItems ?? []),
        payments: [],
      };
      data.invoices.unshift(invoice);
      quote.status = 'invoiced';
      return { invoiceId: invoice.id };
    },
  };
}
