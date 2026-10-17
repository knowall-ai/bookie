import type {
  Contact,
  ContactInput,
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
import { demoActivity } from './modules/activity';

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

/** Extra fictional contact details and contacts the generated demo data doesn't have. */
const DEMO_CONTACT_EXTRAS: Contact[] = [
  {
    id: 'cust-archived-1',
    name: 'Fabrikam Pop-up Kiosk',
    email: 'kiosk@fabrikam.example.com',
    phone: '0161 496 0999',
    isCustomer: true,
    isSupplier: false,
    status: 'archived',
    accountNumber: 'FAB-KIOSK',
  },
  {
    id: 'supp-archived-1',
    name: 'Northwind Packaging (old account)',
    email: 'accounts@northwind-packaging.example.com',
    isCustomer: false,
    isSupplier: true,
    status: 'archived',
  },
];

const seeded = new WeakSet<DemoData>();

/** Enrich the shared demo contacts once per data set (fixtures live here, not in data.ts). */
function seedContacts(data: DemoData) {
  if (seeded.has(data)) return;
  seeded.add(data);
  data.contacts.forEach((c, i) => {
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    c.accountNumber ??= `${c.isCustomer ? 'CUS' : 'SUP'}-${String(i + 1).padStart(3, '0')}`;
    c.website ??= `https://www.${slug.replace(/^-|-$/g, '')}.example.com`;
    c.taxNumber ??= `GB ${String(200_000_000 + i * 13_717).replace(/(\d{3})(\d{4})(\d{2})/, '$1 $2 $3')}`;
  });
  // One contact that is both a customer and a supplier, as in Xero.
  const both = data.contacts.find((c) => c.isSupplier);
  if (both) both.isCustomer = true;
  data.contacts.push(...structuredClone(DEMO_CONTACT_EXTRAS));
}

/** Balances from the live demo invoices, so they move as documents are approved. */
export function demoBalances(data: DemoData, contactId: string): Contact['balances'] {
  const open = data.invoices.filter((i) => i.contact.id === contactId && i.status === 'authorised');
  const sum = (type: 'sales' | 'purchase', overdue: boolean) =>
    open
      .filter((i) => i.type === type && (!overdue || i.isOverdue))
      .reduce((s, i) => s + i.amountDue, 0);
  return {
    receivable: sum('sales', false),
    overdueReceivable: sum('sales', true),
    payable: sum('purchase', false),
    overduePayable: sum('purchase', true),
  };
}

function demoContacts(data: DemoData): ContactsModule {
  seedContacts(data);
  const find = (id: string) => data.contacts.find((c) => c.id === id) ?? notFound('Contact');
  const view = (c: Contact): Contact => ({
    ...structuredClone(c),
    balances: demoBalances(data, c.id),
  });
  const clean = (input: ContactInput) =>
    Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, v === '' ? undefined : v])
    ) as ContactInput;
  return {
    async list(query) {
      const archivedOnly = query?.status === 'archived';
      const all = data.contacts
        .filter(
          (c) =>
            (archivedOnly
              ? c.status === 'archived'
              : query?.includeArchived || c.status === 'active') &&
            (query?.role !== 'customer' || c.isCustomer) &&
            (query?.role !== 'supplier' || c.isSupplier) &&
            matches(
              [c.name, c.email, c.accountNumber, c.firstName, c.lastName],
              query?.search?.trim()
            )
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      return paginate(all.map(view), query);
    },
    get: async (id) => view(find(id)),
    async create(input) {
      const contact: Contact = {
        ...clean(input),
        id: demoId('contact'),
        isCustomer: input.isCustomer ?? true,
        isSupplier: input.isSupplier ?? false,
        status: 'active',
      };
      data.contacts.push(contact);
      return view(contact);
    },
    async update(id, input) {
      const contact = find(id);
      Object.assign(contact, clean(input), {
        isCustomer: input.isCustomer ?? contact.isCustomer,
        isSupplier: input.isSupplier ?? contact.isSupplier,
      });
      // Keep names on existing documents in step, as Xero does.
      for (const invoice of data.invoices)
        if (invoice.contact.id === id) invoice.contact.name = contact.name;
      return view(contact);
    },
    async archive(id) {
      const contact = find(id);
      contact.status = 'archived';
      return view(contact);
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
    activity: demoActivity(data),
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
