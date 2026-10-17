import type {
  CreditAllocation,
  CreditNote,
  CreditNoteInput,
  CreditNoteType,
  InvoiceStatus,
} from '@/lib/domain/types';
import { addDays, DEMO_TODAY, type DemoData } from '../data';
import { ConnectorError, type CreditNotesModule } from '../../types';
import { formatMoney } from '@/lib/ui/format';
import { demoId, matches, notFound, paginate } from '../index';
import { catalogueLine, contactOf, priceLines, totals } from './documents';
import { demoSlot } from './state';
import { demoRecord } from './history';

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

const round = (n: number) => Math.round(n * 100) / 100;

function seed(data: DemoData): CreditNote[] {
  const today = DEMO_TODAY();
  const customers = data.contacts.filter((c) => c.isCustomer);
  const suppliers = data.contacts.filter((c) => c.isSupplier);
  let sales = 0;
  let purchases = 0;
  return FIXTURES.map(([type, who, ago, status, left, reference, lines], i) => {
    const all = type === 'sales' ? customers : suppliers;
    // Approved credit goes to contacts with something outstanding, so it can be allocated.
    const open = all.filter((c) =>
      data.invoices.some(
        (inv) => inv.type === type && inv.status === 'authorised' && inv.contact.id === c.id
      )
    );
    const parties = status === 'authorised' && open.length > 0 ? open : all;
    const contact = parties[who % parties.length];
    const lineItems = priceLines(
      lines.map(([item, qty]) => catalogueLine(data.items[item % data.items.length], qty, type)),
      type
    );
    const sums = totals(lineItems);
    const number =
      type === 'sales' ? `CN-${String(88 - sales++).padStart(4, '0')}` : `SCN-${31 - purchases++}`;
    const date = addDays(today, -ago);
    const remainingCredit = round(sums.total * left);
    // Applied credit on approved fixtures is shown against one of the contact's documents.
    const applied = round(sums.total - remainingCredit);
    const target =
      status !== 'voided' && applied > 0
        ? data.invoices.find((inv) => inv.type === type && inv.contact.id === contact.id)
        : undefined;
    const allocations: CreditAllocation[] = target
      ? [
          {
            id: `alloc-${i + 1}`,
            date,
            amount: applied,
            invoice: { id: target.id, number: target.number },
          },
        ]
      : [];
    return {
      id: `cn-${String(i + 1).padStart(4, '0')}`,
      type,
      number,
      reference,
      contact: { id: contact.id, name: contact.name },
      date,
      status,
      currency: 'GBP',
      lineAmountType: 'exclusive',
      ...sums,
      remainingCredit,
      lineItems,
      allocations,
    } satisfies CreditNote;
  });
}

export function creditNotesOf(data: DemoData): CreditNote[] {
  return demoSlot(data, 'credit-notes', () => seed(data));
}

export function demoCreditNotes(data: DemoData): CreditNotesModule | undefined {
  const notes = () => creditNotesOf(data);
  const find = (id: string) => notes().find((c) => c.id === id) ?? notFound('Credit note');
  const build = (input: CreditNoteInput, id: string, number: string): CreditNote => {
    const contact = contactOf(data, input.contactId);
    const lineItems = priceLines(input.lineItems, input.type);
    const sums = totals(lineItems);
    return {
      id,
      type: input.type,
      number,
      reference: input.reference,
      contact: { id: contact.id, name: contact.name },
      date: input.date,
      status: input.status === 'authorised' ? 'authorised' : 'draft',
      currency: 'GBP',
      lineAmountType: input.lineAmountType ?? 'exclusive',
      ...sums,
      remainingCredit: sums.total,
      lineItems,
      allocations: [],
    };
  };
  const summary = (c: CreditNote) =>
    `${c.number} to ${c.contact.name} for ${formatMoney(c.total, c.currency)}.`;

  return {
    async list(type, query) {
      const all = notes()
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
        structuredClone(all).map(({ lineItems: _l, allocations: _a, ...rest }) => rest),
        query
      );
    },
    get: async (id) => structuredClone(find(id)),
    async create(input) {
      const sameType = notes().filter((c) => c.type === input.type);
      const next =
        Math.max(0, ...sameType.map((c) => Number(c.number.replace(/\D/g, '')) || 0)) + 1;
      const number =
        input.number ||
        (input.type === 'sales' ? `CN-${String(next).padStart(4, '0')}` : `SCN-${next}`);
      const note = build(input, demoId('cn'), number);
      notes().unshift(note);
      demoRecord(data, 'credit-note', note.id, 'Created', summary(note));
      if (note.status === 'authorised')
        demoRecord(data, 'credit-note', note.id, 'Approved', summary(note));
      return structuredClone(note);
    },
    async update(id, input) {
      const existing = find(id);
      if (existing.status !== 'draft' && existing.status !== 'submitted') {
        throw new ConnectorError('Only draft credit notes can be edited.', 409, 'demo');
      }
      const updated = build({ ...input, type: existing.type }, id, input.number || existing.number);
      Object.assign(existing, updated);
      demoRecord(data, 'credit-note', id, 'Edited', summary(updated));
      if (updated.status === 'authorised')
        demoRecord(data, 'credit-note', id, 'Approved', summary(updated));
      return structuredClone(updated);
    },
    async approve(id) {
      const note = find(id);
      if (note.status !== 'draft' && note.status !== 'submitted') {
        throw new ConnectorError('Only draft credit notes can be approved.', 409, 'demo');
      }
      note.status = 'authorised';
      note.remainingCredit = note.total;
      demoRecord(data, 'credit-note', id, 'Approved', summary(note));
      return structuredClone(note);
    },
    async void(id) {
      const note = find(id);
      if (note.status !== 'authorised' || (note.allocations?.length ?? 0) > 0) {
        throw new ConnectorError(
          'Only approved credit notes with no allocations can be voided.',
          409,
          'demo'
        );
      }
      note.status = 'voided';
      note.remainingCredit = 0;
      demoRecord(data, 'credit-note', id, 'Voided', summary(note));
      return structuredClone(note);
    },
    async delete(id) {
      const note = find(id);
      if (note.status !== 'draft' && note.status !== 'submitted') {
        throw new ConnectorError('Only draft credit notes can be deleted.', 409, 'demo');
      }
      note.status = 'deleted';
    },
    async allocate(id, input) {
      const note = find(id);
      const remaining = note.remainingCredit ?? 0;
      if (note.status !== 'authorised' || remaining <= 0) {
        throw new ConnectorError('This credit note has no credit left to allocate.', 409, 'demo');
      }
      const invoice = data.invoices.find((i) => i.id === input.invoiceId);
      if (!invoice || invoice.type !== note.type || invoice.contact.id !== note.contact.id) {
        throw new ConnectorError(
          'Choose an outstanding document for the same contact.',
          400,
          'demo'
        );
      }
      if (invoice.status !== 'authorised') {
        throw new ConnectorError(
          'Credit can only be allocated to an approved document.',
          409,
          'demo'
        );
      }
      const amount = round(input.amount);
      if (!(amount > 0) || amount > remaining + 0.005 || amount > invoice.amountDue + 0.005) {
        throw new ConnectorError(
          `The amount must be more than zero and no more than ${formatMoney(Math.min(remaining, invoice.amountDue), note.currency)}.`,
          400,
          'demo'
        );
      }
      note.remainingCredit = round(remaining - amount);
      if (note.remainingCredit <= 0) {
        note.remainingCredit = 0;
        note.status = 'paid';
      }
      note.allocations = [
        ...(note.allocations ?? []),
        {
          id: demoId('alloc'),
          date: input.date,
          amount,
          invoice: { id: invoice.id, number: invoice.number },
        },
      ];
      invoice.amountCredited = round((invoice.amountCredited ?? 0) + amount);
      invoice.amountDue = round(invoice.amountDue - amount);
      if (invoice.amountDue <= 0) {
        invoice.amountDue = 0;
        invoice.status = 'paid';
      }
      invoice.isOverdue =
        invoice.status === 'authorised' && !!invoice.dueDate && invoice.dueDate < DEMO_TODAY();
      const details = `Credit applied on ${input.date} for ${formatMoney(amount, note.currency)}.`;
      demoRecord(data, 'credit-note', id, 'Applied', `${details} (${invoice.number})`);
      demoRecord(data, 'invoice', invoice.id, 'Credit applied', `${note.number}: ${details}`);
      return structuredClone(note);
    },
  };
}
