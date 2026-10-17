import type {
  DashboardSummary,
  DocumentBucket,
  Invoice,
  InvoiceStatus,
  ListQuery,
  OrgRef,
  Page,
} from '@/lib/domain/types';
import {
  ConnectorError,
  type AccountingConnector,
  type ContactsModule,
  type InvoicesModule,
} from '../types';
import { addDays, demoData, DEMO_TODAY, type DemoData } from './data';
import { demoQuotes } from './modules/quotes';
import { demoCreditNotes } from './modules/credit-notes';
import { demoPurchaseOrders } from './modules/purchase-orders';
import { demoItems } from './modules/items';
import { demoPayments } from './modules/payments';
import { demoBank } from './modules/bank';
import { demoAccounts } from './modules/accounts';
import { demoJournals } from './modules/journals';
import { demoTaxRates } from './modules/tax-rates';
import { demoAssets } from './modules/assets';
import { demoReports } from './modules/reports';
import { demoPayroll } from './modules/payroll';
import { demoProjects } from './modules/projects';

export const DEMO_ORGS: OrgRef[] = [
  {
    key: 'demo.contoso',
    kind: 'demo',
    name: 'Contoso Coffee Roasters Ltd',
    sourceLabel: 'Demo',
    country: 'GB',
    baseCurrency: 'GBP',
  },
  {
    key: 'demo.contoso-wholesale',
    kind: 'demo',
    name: 'Contoso Wholesale Ltd',
    sourceLabel: 'Demo',
    country: 'GB',
    baseCurrency: 'GBP',
  },
];

/** Shared paging/filtering for demo lists. */
export function paginate<T>(all: T[], query?: ListQuery): Page<T> {
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 50;
  return {
    items: all.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    hasMore: all.length > page * pageSize,
    total: all.length,
  };
}

export function matches(text: (string | undefined)[], search?: string) {
  if (!search) return true;
  const needle = search.toLowerCase();
  return text.some((t) => t?.toLowerCase().includes(needle));
}

export function notFound(what: string): never {
  throw new ConnectorError(`${what} not found.`, 404, 'demo');
}

let sequence = 1;
export const demoId = (prefix: string) => `${prefix}-new-${Date.now().toString(36)}-${sequence++}`;

function demoInvoices(data: DemoData): InvoicesModule {
  const find = (id: string) => data.invoices.find((i) => i.id === id) ?? notFound('Invoice');
  const setStatus = (id: string, status: InvoiceStatus) => {
    const invoice = find(id);
    invoice.status = status;
    if (status === 'voided') invoice.amountDue = 0;
    invoice.isOverdue =
      status === 'authorised' && !!invoice.dueDate && invoice.dueDate < DEMO_TODAY();
    return structuredClone(invoice);
  };
  const build = (
    input: Parameters<NonNullable<InvoicesModule['create']>>[0],
    id: string,
    number: string
  ): Invoice => {
    const contact = data.contacts.find((c) => c.id === input.contactId) ?? notFound('Contact');
    const lineItems = input.lineItems.map((l) => {
      const lineAmount =
        Math.round(l.quantity * l.unitAmount * (1 - (l.discountRate ?? 0) / 100) * 100) / 100;
      return { ...l, lineAmount, taxAmount: Math.round(lineAmount * 0.2 * 100) / 100 };
    });
    const subTotal = lineItems.reduce((s, l) => s + l.lineAmount, 0);
    const totalTax = lineItems.reduce((s, l) => s + (l.taxAmount ?? 0), 0);
    const status = input.status ?? 'draft';
    return {
      id,
      type: input.type,
      number,
      reference: input.reference,
      contact: { id: contact.id, name: contact.name },
      date: input.date,
      dueDate: input.dueDate ?? addDays(input.date, 30),
      status,
      currency: 'GBP',
      lineAmountType: input.lineAmountType ?? 'exclusive',
      subTotal,
      totalTax,
      total: subTotal + totalTax,
      amountDue: subTotal + totalTax,
      amountPaid: 0,
      isOverdue: false,
      lineItems,
      payments: [],
    };
  };
  return {
    async list(type, query) {
      const today = DEMO_TODAY();
      const all = data.invoices.filter(
        (i) =>
          i.type === type &&
          i.status !== 'deleted' &&
          (!query?.status || query.status === 'all'
            ? i.status !== 'voided'
            : query.status === 'overdue'
              ? i.status === 'authorised' && !!i.dueDate && i.dueDate < today
              : i.status === query.status) &&
          (!query?.contactId || i.contact.id === query.contactId) &&
          (!query?.from || i.date >= query.from) &&
          (!query?.to || i.date <= query.to) &&
          matches([i.number, i.reference, i.contact.name], query?.search)
      );
      return paginate(
        structuredClone(all).map(({ lineItems: _l, ...rest }) => rest),
        query
      );
    },
    get: async (id) => structuredClone(find(id)),
    async create(input) {
      const count = data.invoices.filter((i) => i.type === input.type).length;
      const number =
        input.number ||
        (input.type === 'sales'
          ? `INV-${String(1100 + count).padStart(4, '0')}`
          : `BILL-${600 + count}`);
      const invoice = build(input, demoId(input.type === 'sales' ? 'inv' : 'bill'), number);
      data.invoices.unshift(invoice);
      return structuredClone(invoice);
    },
    async update(id, input) {
      const existing = find(id);
      if (existing.status !== 'draft' && existing.status !== 'submitted') {
        throw new ConnectorError('Only draft invoices can be edited.', 409, 'demo');
      }
      Object.assign(existing, build(input, id, input.number || existing.number));
      return structuredClone(existing);
    },
    approve: async (id) => setStatus(id, 'authorised'),
    void: async (id) => setStatus(id, 'voided'),
    async delete(id) {
      setStatus(id, 'deleted');
    },
    async email(id) {
      find(id).sentToContact = true;
    },
  };
}

function demoContacts(data: DemoData): ContactsModule {
  const find = (id: string) => data.contacts.find((c) => c.id === id) ?? notFound('Contact');
  return {
    async list(query) {
      const all = data.contacts
        .filter(
          (c) =>
            (query?.includeArchived || c.status === 'active') &&
            (query?.role !== 'customer' || c.isCustomer) &&
            (query?.role !== 'supplier' || c.isSupplier) &&
            matches([c.name, c.email], query?.search)
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      return paginate(structuredClone(all), query);
    },
    get: async (id) => structuredClone(find(id)),
    async create(input) {
      const contact = {
        ...input,
        id: demoId('contact'),
        isCustomer: input.isCustomer ?? true,
        isSupplier: input.isSupplier ?? false,
        status: 'active' as const,
      };
      data.contacts.push(contact);
      return structuredClone(contact);
    },
    async update(id, input) {
      const contact = find(id);
      Object.assign(contact, input);
      return structuredClone(contact);
    },
    async archive(id) {
      const contact = find(id);
      contact.status = 'archived';
      return structuredClone(contact);
    },
  };
}

function summarise(invoices: Invoice[]) {
  const b = (): DocumentBucket => ({ count: 0, total: 0 });
  const s = { draft: b(), awaitingApproval: b(), awaitingPayment: b(), overdue: b() };
  for (const i of invoices) {
    const target =
      i.status === 'draft'
        ? s.draft
        : i.status === 'submitted'
          ? s.awaitingApproval
          : i.status === 'authorised'
            ? s.awaitingPayment
            : undefined;
    if (!target) continue;
    target.count++;
    target.total += i.amountDue;
    if (i.isOverdue) {
      s.overdue.count++;
      s.overdue.total += i.amountDue;
    }
  }
  return s;
}

export function createDemoConnector(org: OrgRef): AccountingConnector {
  const data = demoData(org.key.split('.')[1]);
  return {
    kind: 'demo',
    org,
    async organisation() {
      return {
        name: org.name,
        legalName: org.name,
        country: 'GB',
        baseCurrency: 'GBP',
        taxNumber: 'GB 123 4567 89',
        registrationNumber: '01234567',
        financialYearEndDay: 31,
        financialYearEndMonth: 3,
        timezone: 'Europe/London',
        address: {
          line1: '1 Roastery Yard',
          city: 'Manchester',
          postalCode: 'M1 1AA',
          country: 'United Kingdom',
        },
      };
    },
    async dashboard(): Promise<DashboardSummary> {
      const now = new Date();
      const trend = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
        const month = d.toISOString().slice(0, 7);
        const income = data.invoices
          .filter(
            (x) =>
              x.type === 'sales' &&
              x.date.startsWith(month) &&
              (x.status === 'authorised' || x.status === 'paid')
          )
          .reduce((s, x) => s + x.subTotal, 0);
        const expenses =
          data.invoices
            .filter(
              (x) =>
                x.type === 'purchase' &&
                x.date.startsWith(month) &&
                (x.status === 'authorised' || x.status === 'paid')
            )
            .reduce((s, x) => s + x.subTotal, 0) + 4200;
        return { month, income, expenses };
      });
      const fyStart = `${now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1}-04-01`;
      const ytd = trend.filter((t) => `${t.month}-01` >= fyStart);
      const income = ytd.reduce((s, t) => s + t.income, 0);
      const expenses = ytd.reduce((s, t) => s + t.expenses, 0);
      return {
        currency: 'GBP',
        bankAccounts: structuredClone(data.bankAccounts),
        receivables: summarise(data.invoices.filter((i) => i.type === 'sales')),
        payables: summarise(data.invoices.filter((i) => i.type === 'purchase')),
        trend,
        profitAndLoss: {
          from: fyStart,
          to: DEMO_TODAY(),
          income,
          expenses,
          net: income - expenses,
        },
      };
    },
    invoices: demoInvoices(data),
    contacts: demoContacts(data),
    quotes: demoQuotes(data),
    creditNotes: demoCreditNotes(data),
    purchaseOrders: demoPurchaseOrders(data),
    items: demoItems(data),
    payments: demoPayments(data),
    bank: demoBank(data),
    accounts: demoAccounts(data),
    journals: demoJournals(data),
    taxRates: demoTaxRates(data),
    assets: demoAssets(data),
    reports: demoReports(data, org.name),
    payroll: demoPayroll(data),
    projects: demoProjects(data),
  };
}
