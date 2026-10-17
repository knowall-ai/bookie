import 'server-only';
import type {
  Contact,
  ContactInput,
  DashboardSummary,
  DocumentBucket,
  Invoice,
  InvoiceInput,
  InvoiceStatus,
  InvoiceType,
  LineItem,
  ListQuery,
  OrgDetails,
  OrgRef,
} from '@/lib/domain/types';
import type { AccountingConnector, ContactsModule, InvoicesModule } from '../types';
import { ConnectorError } from '../types';
import { bcWebClientLink, odataString, type BcClient, type ODataList } from './client';
import { bcQuotes } from './modules/quotes';
import { bcCreditNotes } from './modules/credit-notes';
import { bcPurchaseOrders } from './modules/purchase-orders';
import { bcItems } from './modules/items';
import { bcPayments } from './modules/payments';
import { bcBank } from './modules/bank';
import { bcAccounts } from './modules/accounts';
import { bcJournals } from './modules/journals';
import { bcTaxRates } from './modules/tax-rates';
import { bcAssets } from './modules/assets';
import { bcReports } from './modules/reports';
import { bcPayroll } from './modules/payroll';
import { bcProjects } from './modules/projects';

const DEFAULT_PAGE_SIZE = 50;

/* ------------------------------------------------------------------ */
/* Raw shapes                                                          */
/* ------------------------------------------------------------------ */

interface BcInvoiceLine {
  id: string;
  lineType?: string;
  lineObjectNumber?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  unitCost?: number;
  discountPercent?: number;
  taxCode?: string;
  amountExcludingTax?: number;
  totalTaxAmount?: number;
  amountIncludingTax?: number;
  netAmount?: number;
}

export interface BcSalesInvoice {
  id: string;
  '@odata.etag'?: string;
  number: string;
  externalDocumentNumber?: string;
  invoiceDate: string;
  dueDate?: string;
  customerId: string;
  customerName: string;
  currencyCode?: string;
  pricesIncludeTax?: boolean;
  status: 'Draft' | 'In Review' | 'Open' | 'Paid' | 'Canceled' | 'Corrective';
  totalAmountExcludingTax?: number;
  totalTaxAmount?: number;
  totalAmountIncludingTax?: number;
  remainingAmount?: number;
  lastModifiedDateTime?: string;
  salesInvoiceLines?: BcInvoiceLine[];
}

export interface BcPurchaseInvoice {
  id: string;
  '@odata.etag'?: string;
  number: string;
  vendorInvoiceNumber?: string;
  invoiceDate: string;
  dueDate?: string;
  vendorId: string;
  vendorName: string;
  currencyCode?: string;
  pricesIncludeTax?: boolean;
  status: 'Draft' | 'In Review' | 'Open' | 'Paid' | 'Canceled' | 'Corrective';
  totalAmountExcludingTax?: number;
  totalTaxAmount?: number;
  totalAmountIncludingTax?: number;
  lastModifiedDateTime?: string;
  purchaseInvoiceLines?: BcInvoiceLine[];
}

export interface BcParty {
  id: string;
  number: string;
  displayName: string;
  email?: string;
  phoneNumber?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  taxRegistrationNumber?: string;
  currencyCode?: string;
  blocked?: string;
  balanceDue?: number;
  balance?: number;
  lastModifiedDateTime?: string;
  /** Customers only, via `$expand=customerFinancialDetail`. */
  customerFinancialDetail?: { balance?: number; overdueAmount?: number };
}

interface BcCompanyInformation {
  displayName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  currencyCode?: string;
  currentFiscalYearStartDate?: string;
  taxRegistrationNumber?: string;
}

/* ------------------------------------------------------------------ */
/* Mapping helpers                                                     */
/* ------------------------------------------------------------------ */

const STATUS: Record<BcSalesInvoice['status'], InvoiceStatus> = {
  Draft: 'draft',
  'In Review': 'submitted',
  Open: 'authorised',
  Paid: 'paid',
  Canceled: 'voided',
  Corrective: 'voided',
};

const BC_STATUS_FILTER: Record<string, string | undefined> = {
  draft: "status eq 'Draft'",
  submitted: "status eq 'In Review'",
  authorised: "status eq 'Open'",
  paid: "status eq 'Paid'",
  voided: "(status eq 'Canceled' or status eq 'Corrective')",
};

const COUNTRY_CURRENCY: Record<string, string> = {
  GB: 'GBP',
  IE: 'EUR',
  US: 'USD',
  SV: 'USD',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  ZA: 'ZAR',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  PT: 'EUR',
  FI: 'EUR',
  MX: 'MXN',
  DK: 'DKK',
  SE: 'SEK',
  NO: 'NOK',
  CH: 'CHF',
  IN: 'INR',
};

export function currencyForCountry(country?: string): string | undefined {
  return country ? COUNTRY_CURRENCY[country.toUpperCase()] : undefined;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** BC uses 0001-01-01 for "no date". */
export function bcDate(value?: string): string | undefined {
  if (!value || value.startsWith('0001-01-01')) return undefined;
  return value.slice(0, 10);
}

function fromLine(line: BcInvoiceLine): LineItem {
  return {
    id: line.id,
    itemCode: line.lineType === 'Item' ? line.lineObjectNumber : undefined,
    accountCode: line.lineType === 'Account' ? line.lineObjectNumber : undefined,
    description: line.description ?? '',
    quantity: line.quantity ?? 0,
    unitAmount: line.unitPrice ?? line.unitCost ?? 0,
    discountRate: line.discountPercent || undefined,
    taxType: line.taxCode || undefined,
    taxAmount: line.totalTaxAmount,
    lineAmount: line.amountExcludingTax ?? line.netAmount ?? 0,
  };
}

function toLine(line: InvoiceInput['lineItems'][number], type: InvoiceType) {
  const lineType = line.itemCode ? 'Item' : line.accountCode ? 'Account' : 'Comment';
  return {
    lineType,
    lineObjectNumber: line.itemCode ?? line.accountCode,
    description: line.description,
    ...(lineType === 'Comment'
      ? {}
      : {
          quantity: line.quantity,
          [type === 'sales' ? 'unitPrice' : 'directUnitCost']: line.unitAmount,
          discountPercent: line.discountRate,
          taxCode: line.taxType,
        }),
  };
}

export function fromSalesInvoice(raw: BcSalesInvoice, lcy: string): Invoice {
  const status = STATUS[raw.status] ?? 'draft';
  const total = raw.totalAmountIncludingTax ?? 0;
  const amountDue =
    status === 'draft' || status === 'submitted' ? total : (raw.remainingAmount ?? 0);
  const dueDate = bcDate(raw.dueDate);
  return {
    id: raw.id,
    type: 'sales',
    number: raw.number,
    reference: raw.externalDocumentNumber || undefined,
    contact: { id: `c:${raw.customerId}`, name: raw.customerName },
    date: bcDate(raw.invoiceDate) ?? '',
    dueDate,
    status,
    currency: raw.currencyCode || lcy,
    lineAmountType: raw.pricesIncludeTax ? 'inclusive' : 'exclusive',
    subTotal: raw.totalAmountExcludingTax ?? 0,
    totalTax: raw.totalTaxAmount ?? 0,
    total,
    amountDue,
    amountPaid: status === 'authorised' || status === 'paid' ? total - amountDue : 0,
    isOverdue: status === 'authorised' && !!dueDate && dueDate < today() && amountDue > 0,
    lineItems: raw.salesInvoiceLines?.map(fromLine),
    updatedAt: raw.lastModifiedDateTime,
  };
}

export function fromPurchaseInvoice(raw: BcPurchaseInvoice, lcy: string): Invoice {
  const status = STATUS[raw.status] ?? 'draft';
  const total = raw.totalAmountIncludingTax ?? 0;
  // BC's purchase invoice API has no remaining amount; Open means unpaid.
  const amountDue = status === 'paid' || status === 'voided' ? 0 : total;
  const dueDate = bcDate(raw.dueDate);
  return {
    id: raw.id,
    type: 'purchase',
    number: raw.number,
    reference: raw.vendorInvoiceNumber || undefined,
    contact: { id: `v:${raw.vendorId}`, name: raw.vendorName },
    date: bcDate(raw.invoiceDate) ?? '',
    dueDate,
    status,
    currency: raw.currencyCode || lcy,
    lineAmountType: raw.pricesIncludeTax ? 'inclusive' : 'exclusive',
    subTotal: raw.totalAmountExcludingTax ?? 0,
    totalTax: raw.totalTaxAmount ?? 0,
    total,
    amountDue,
    amountPaid: total - amountDue,
    isOverdue: status === 'authorised' && !!dueDate && dueDate < today() && amountDue > 0,
    lineItems: raw.purchaseInvoiceLines?.map(fromLine),
    updatedAt: raw.lastModifiedDateTime,
  };
}

/** Contacts merge BC customers (`c:` ids) and vendors (`v:` ids). */
export function parseContactId(id: string): { entity: 'customers' | 'vendors'; id: string } {
  // Ids end up inside OData paths and filters, so only accept `c:`/`v:` + a GUID.
  const match = /^([cv]):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(id);
  if (!match) throw new ConnectorError('Unknown contact id.', 400, 'business-central');
  return { entity: match[1].toLowerCase() === 'c' ? 'customers' : 'vendors', id: match[2] };
}

/** BC's `blocked` enum is blank (`" "`, serialised `_x0020_`) for active parties. */
export function isBlocked(blocked: string | undefined): boolean {
  return !!blocked && blocked.trim() !== '' && blocked !== '_x0020_';
}

export function fromParty(raw: BcParty, entity: 'customers' | 'vendors'): Contact {
  const isCustomer = entity === 'customers';
  const balance = (isCustomer ? raw.balanceDue : raw.balance) ?? raw.balanceDue ?? raw.balance;
  return {
    id: `${isCustomer ? 'c' : 'v'}:${raw.id}`,
    name: raw.displayName,
    email: raw.email || undefined,
    phone: raw.phoneNumber || undefined,
    website: raw.website || undefined,
    accountNumber: raw.number,
    taxNumber: raw.taxRegistrationNumber || undefined,
    address:
      raw.addressLine1 || raw.city
        ? {
            line1: raw.addressLine1 || undefined,
            line2: raw.addressLine2 || undefined,
            city: raw.city || undefined,
            region: raw.state || undefined,
            postalCode: raw.postalCode || undefined,
            country: raw.country || undefined,
          }
        : undefined,
    isCustomer,
    isSupplier: !isCustomer,
    status: isBlocked(raw.blocked) ? 'archived' : 'active',
    currency: raw.currencyCode || undefined,
    balances: isCustomer
      ? {
          receivable: balance ?? 0,
          overdueReceivable: raw.customerFinancialDetail?.overdueAmount,
        }
      : { payable: balance ?? 0 },
    updatedAt: raw.lastModifiedDateTime,
  };
}

export function toParty(input: ContactInput) {
  return {
    displayName: input.name,
    email: input.email,
    phoneNumber: input.phone,
    website: input.website,
    taxRegistrationNumber: input.taxNumber,
    addressLine1: input.address?.line1,
    addressLine2: input.address?.line2,
    city: input.address?.city,
    state: input.address?.region,
    postalCode: input.address?.postalCode,
    country: input.address?.country,
  };
}

/* ------------------------------------------------------------------ */
/* Modules                                                             */
/* ------------------------------------------------------------------ */

function bcInvoices(
  client: BcClient,
  lcy: () => Promise<string>,
  link: (i: Invoice) => Invoice
): InvoicesModule {
  const entity = (type: InvoiceType) => (type === 'sales' ? 'salesInvoices' : 'purchaseInvoices');
  const linesOf = (type: InvoiceType) =>
    type === 'sales' ? 'salesInvoiceLines' : 'purchaseInvoiceLines';
  const map = async (type: InvoiceType, raw: BcSalesInvoice | BcPurchaseInvoice) =>
    link(
      type === 'sales'
        ? fromSalesInvoice(raw as BcSalesInvoice, await lcy())
        : fromPurchaseInvoice(raw as BcPurchaseInvoice, await lcy())
    );

  /** Purchase and sales invoice ids are unique GUIDs; try sales first, then purchase. */
  const locate = async (id: string) => {
    for (const type of ['sales', 'purchase'] as const) {
      try {
        const raw = await client.request<BcSalesInvoice | BcPurchaseInvoice>(
          `${entity(type)}(${id})`,
          { query: { $expand: linesOf(type) } }
        );
        return { type, raw };
      } catch (error) {
        if (!(error instanceof ConnectorError) || error.status !== 404) throw error;
      }
    }
    throw new ConnectorError('Invoice not found.', 404, 'business-central');
  };

  const writeLines = async (type: InvoiceType, id: string, input: InvoiceInput) => {
    for (const line of input.lineItems) {
      await client.request(`${entity(type)}(${id})/${linesOf(type)}`, {
        method: 'POST',
        body: toLine(line, type),
      });
    }
  };

  const header = (input: InvoiceInput) =>
    input.type === 'sales'
      ? {
          customerId: input.contactId.replace(/^c:/, ''),
          invoiceDate: input.date,
          dueDate: input.dueDate,
          externalDocumentNumber: input.reference,
          currencyCode: input.currency,
        }
      : {
          vendorId: input.contactId.replace(/^v:/, ''),
          invoiceDate: input.date,
          dueDate: input.dueDate,
          vendorInvoiceNumber: input.reference ?? input.number,
          currencyCode: input.currency,
        };

  const action = async (id: string, name: string) => {
    const { type } = await locate(id);
    await client.request(`${entity(type)}(${id})/Microsoft.NAV.${name}`, { method: 'POST' });
    return mod.get(id);
  };

  const mod: InvoicesModule = {
    async list(type, query?: ListQuery) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const filters: string[] = [];
      if (query?.status === 'overdue') {
        filters.push(`status eq 'Open' and dueDate lt ${today()}`);
      } else if (query?.status && BC_STATUS_FILTER[query.status]) {
        filters.push(BC_STATUS_FILTER[query.status]!);
      }
      if (query?.from) filters.push(`invoiceDate ge ${query.from}`);
      if (query?.to) filters.push(`invoiceDate le ${query.to}`);
      if (query?.contactId) {
        const { id } = parseContactId(query.contactId);
        filters.push(`${type === 'sales' ? 'customerId' : 'vendorId'} eq ${id}`);
      }
      const orderby = 'invoiceDate desc,number desc';
      if (query?.search) {
        // BC rejects `or` across different fields, so search each field separately and merge.
        const s = odataString(query.search);
        const fields =
          type === 'sales'
            ? ['number', 'customerName', 'externalDocumentNumber']
            : ['number', 'vendorName', 'vendorInvoiceNumber'];
        const results = await Promise.all(
          fields.map((field) =>
            client.all<BcSalesInvoice | BcPurchaseInvoice>(
              entity(type),
              {
                $filter: [...filters, `contains(${field},${s})`].join(' and '),
                $orderby: orderby,
                $top: 500,
              },
              1
            )
          )
        );
        const byId = new Map(results.flat().map((raw) => [raw.id, raw]));
        const merged = [...byId.values()].sort(
          (a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.number.localeCompare(a.number)
        );
        const slice = merged.slice((page - 1) * pageSize, page * pageSize);
        const items = await Promise.all(slice.map((raw) => map(type, raw)));
        return {
          items,
          page,
          pageSize,
          hasMore: merged.length > page * pageSize,
          total: merged.length,
        };
      }
      const result = await client.request<ODataList<BcSalesInvoice | BcPurchaseInvoice>>(
        entity(type),
        {
          query: {
            $filter: filters.join(' and ') || undefined,
            $orderby: orderby,
            $top: pageSize + 1,
            $skip: (page - 1) * pageSize,
          },
        }
      );
      const items = await Promise.all(result.value.slice(0, pageSize).map((raw) => map(type, raw)));
      return { items, page, pageSize, hasMore: result.value.length > pageSize };
    },
    async get(id) {
      const { type, raw } = await locate(id);
      return map(type, raw);
    },
    async create(input) {
      const created = await client.request<{ id: string }>(entity(input.type), {
        method: 'POST',
        body: header(input),
      });
      await writeLines(input.type, created.id, input);
      if (input.status === 'authorised') return action(created.id, 'post');
      return mod.get(created.id);
    },
    async update(id, input) {
      const { type, raw } = await locate(id);
      if (raw.status !== 'Draft') {
        throw new ConnectorError(
          'Only draft invoices can be edited in Business Central.',
          409,
          'business-central'
        );
      }
      await client.request(`${entity(type)}(${id})`, {
        method: 'PATCH',
        etag: '*',
        body: header(input),
      });
      const lines =
        (type === 'sales'
          ? (raw as BcSalesInvoice).salesInvoiceLines
          : (raw as BcPurchaseInvoice).purchaseInvoiceLines) ?? [];
      for (const line of lines) {
        await client.request(`${entity(type)}(${id})/${linesOf(type)}(${line.id})`, {
          method: 'DELETE',
          etag: '*',
        });
      }
      await writeLines(type, id, input);
      return mod.get(id);
    },
    approve: (id) => action(id, 'post'),
    void: (id) => action(id, 'cancel'),
    async delete(id) {
      const { type } = await locate(id);
      await client.request(`${entity(type)}(${id})`, { method: 'DELETE', etag: '*' });
    },
    async email(id) {
      await client.request(`salesInvoices(${id})/Microsoft.NAV.send`, { method: 'POST' });
    },
    async pdf(id) {
      const { type } = await locate(id);
      const docs = await client.request<ODataList<{ id: string }>>(
        `${entity(type)}(${id})/pdfDocument`
      );
      const doc = docs.value[0];
      if (!doc) throw new ConnectorError('No PDF available.', 404, 'business-central');
      return client.request<ArrayBuffer>(
        `${entity(type)}(${id})/pdfDocument(${doc.id})/pdfDocumentContent`,
        {
          raw: true,
        }
      );
    },
  };
  return mod;
}

const PARTY_FIELDS =
  'id,number,displayName,email,phoneNumber,website,addressLine1,addressLine2,city,state,postalCode,country,taxRegistrationNumber,currencyCode,blocked,lastModifiedDateTime';
const PARTY_SELECT = {
  customers: `${PARTY_FIELDS},balanceDue`,
  vendors: `${PARTY_FIELDS},balance`,
} as const;

/**
 * Contacts search: name, number (BC "No.") or email, case-insensitive. Done in
 * memory because BC's OData rejects `or` across different fields ("The 'OR'
 * operator is not supported on distinct fields"), and the list already loads
 * every party to merge customers with vendors.
 */
export function matchesPartySearch(contact: Contact, search: string | undefined): boolean {
  const needle = search?.trim().toLowerCase();
  if (!needle) return true;
  return [contact.name, contact.accountNumber, contact.email].some((v) =>
    v?.toLowerCase().includes(needle)
  );
}

function bcContacts(client: BcClient): ContactsModule {
  return {
    async list(query) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const entities: ('customers' | 'vendors')[] =
        query?.role === 'customer'
          ? ['customers']
          : query?.role === 'supplier'
            ? ['vendors']
            : ['customers', 'vendors'];
      // BC has no merged "contacts" endpoint, so fetch customers and vendors
      // (lean $select), then merge, filter and page here. Balances come with
      // the rows, so there is no per-contact call.
      const results = await Promise.all(
        entities.map(async (entity) =>
          (
            await client.all<BcParty>(entity, {
              $orderby: 'displayName',
              $select: PARTY_SELECT[entity],
            })
          ).map((raw) => fromParty(raw, entity))
        )
      );
      const archivedOnly = query?.status === 'archived';
      const all = results
        .flat()
        .filter(
          (c) =>
            (archivedOnly
              ? c.status === 'archived'
              : query?.includeArchived || c.status === 'active') &&
            matchesPartySearch(c, query?.search)
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      const items = all.slice((page - 1) * pageSize, page * pageSize);
      return { items, page, pageSize, hasMore: all.length > page * pageSize, total: all.length };
    },
    async get(id) {
      const { entity, id: raw } = parseContactId(id);
      if (entity === 'customers') {
        // The financial detail carries the overdue amount (one expand, detail page only).
        return fromParty(
          await client.request<BcParty>(`customers(${raw})`, {
            query: { $expand: 'customerFinancialDetail' },
          }),
          entity
        );
      }
      const [vendor, overdue] = await Promise.all([
        client.request<BcParty>(`vendors(${raw})`),
        // BC's v2.0 API has no vendor overdue figure and purchase invoices carry no
        // remaining amount: sum open bills past their due date, as the bills list does.
        client
          .all<BcPurchaseInvoice>('purchaseInvoices', {
            $filter: `vendorId eq ${raw} and status eq 'Open' and dueDate lt ${today()}`,
            $select: 'id,totalAmountIncludingTax',
          })
          .then((rows) => rows.reduce((s, r) => s + (r.totalAmountIncludingTax ?? 0), 0))
          .catch(() => undefined),
      ]);
      const contact = fromParty(vendor, entity);
      return { ...contact, balances: { ...contact.balances, overduePayable: overdue } };
    },
    async create(input) {
      const entity = input.isSupplier && !input.isCustomer ? 'vendors' : 'customers';
      return fromParty(
        await client.request<BcParty>(entity, { method: 'POST', body: toParty(input) }),
        entity
      );
    },
    async update(id, input) {
      const { entity, id: raw } = parseContactId(id);
      return fromParty(
        await client.request<BcParty>(`${entity}(${raw})`, {
          method: 'PATCH',
          etag: '*',
          body: toParty(input),
        }),
        entity
      );
    },
    async archive(id) {
      const { entity, id: raw } = parseContactId(id);
      return fromParty(
        await client.request<BcParty>(`${entity}(${raw})`, {
          method: 'PATCH',
          etag: '*',
          body: { blocked: 'All' },
        }),
        entity
      );
    },
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

function emptyBuckets() {
  const b = (): DocumentBucket => ({ count: 0, total: 0 });
  return { draft: b(), awaitingApproval: b(), awaitingPayment: b(), overdue: b() };
}

function summarise(invoices: Invoice[]) {
  const summary = emptyBuckets();
  for (const invoice of invoices) {
    const target =
      invoice.status === 'draft'
        ? summary.draft
        : invoice.status === 'submitted'
          ? summary.awaitingApproval
          : invoice.status === 'authorised'
            ? summary.awaitingPayment
            : undefined;
    if (!target) continue;
    target.count += 1;
    target.total += invoice.status === 'authorised' ? invoice.amountDue : invoice.total;
    if (invoice.isOverdue) {
      summary.overdue.count += 1;
      summary.overdue.total += invoice.amountDue;
    }
  }
  return summary;
}

interface BcStatementLine {
  display: string;
  netChange?: number;
  lineType: string;
}

async function incomeStatement(client: BcClient, from: string, to: string) {
  const lines = await client.all<BcStatementLine>('incomeStatements', {
    $filter: `dateFilter ge ${from} and dateFilter le ${to}`,
  });
  const find = (pattern: RegExp) => lines.find((l) => pattern.test(l.display))?.netChange;
  // BC shows income as a negative net change (credit); flip so income is positive.
  const income = -(find(/^Total Revenue$|^Total Income$|^Revenue$|^Income$/i) ?? 0);
  const net = -(find(/^Net Income$|^Net Profit|^NET INCOME$/i) ?? 0);
  return { income, expenses: income - net, net };
}

export interface BcConnectorOptions {
  org: OrgRef;
  client: BcClient;
  companyName: string;
}

export function createBcConnector({
  org,
  client,
  companyName,
}: BcConnectorOptions): AccountingConnector {
  let info: Promise<BcCompanyInformation> | undefined;
  const companyInformation = () =>
    (info ??= client
      .request<ODataList<BcCompanyInformation>>('companyInformation')
      .then((r) => r.value[0] ?? {}));
  // BC leaves currencyCode blank when it is the local currency; infer it from the country.
  const lcy = async () => {
    const c = await companyInformation();
    return c.currencyCode || currencyForCountry(c.country) || org.baseCurrency || 'GBP';
  };

  const link = (invoice: Invoice): Invoice => {
    const posted = invoice.status !== 'draft' && invoice.status !== 'submitted';
    const page = invoice.type === 'sales' ? (posted ? 132 : 43) : posted ? 138 : 51;
    return {
      ...invoice,
      sourceUrl: bcWebClientLink(
        client.tenantId,
        client.environment,
        companyName,
        page,
        `'No.' IS '${invoice.number}'`
      ),
    };
  };

  const bank = bcBank(client, lcy);

  return {
    kind: 'business-central',
    org,

    async organisation(): Promise<OrgDetails> {
      const c = await companyInformation();
      return {
        name: c.displayName || org.name,
        country: c.country || undefined,
        baseCurrency: await lcy(),
        taxNumber: c.taxRegistrationNumber || undefined,
        address: {
          line1: c.addressLine1 || undefined,
          line2: c.addressLine2 || undefined,
          city: c.city || undefined,
          region: c.state || undefined,
          postalCode: c.postalCode || undefined,
          country: c.country || undefined,
        },
        sourceUrl: bcWebClientLink(client.tenantId, client.environment, companyName, 9022),
      };
    },

    async dashboard(): Promise<DashboardSummary> {
      const [currency, info, sales, purchases] = await Promise.all([
        lcy(),
        companyInformation(),
        client.all<BcSalesInvoice>('salesInvoices', {
          $filter: "status ne 'Paid' and status ne 'Canceled' and status ne 'Corrective'",
        }),
        client.all<BcPurchaseInvoice>('purchaseInvoices', {
          $filter: "status ne 'Paid' and status ne 'Canceled' and status ne 'Corrective'",
        }),
      ]);
      const now = new Date();
      const months = Array.from({ length: 12 }, (_, i) => {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
        const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
        return {
          month: start.toISOString().slice(0, 7),
          from: start.toISOString().slice(0, 10),
          to: end.toISOString().slice(0, 10),
        };
      });
      const fyStart = bcDate(info.currentFiscalYearStartDate) ?? `${now.getUTCFullYear()}-01-01`;
      const [trend, ytd, bankAccounts] = await Promise.all([
        Promise.all(
          months.map(async (m) => ({
            month: m.month,
            ...(await incomeStatement(client, m.from, m.to)),
          }))
        ),
        incomeStatement(client, fyStart, today()),
        bank?.accounts().catch(() => []) ?? Promise.resolve([]),
      ]);
      return {
        currency,
        bankAccounts,
        receivables: summarise(sales.map((s) => fromSalesInvoice(s, currency))),
        payables: summarise(purchases.map((p) => fromPurchaseInvoice(p, currency))),
        trend: trend.map(({ month, income, expenses }) => ({ month, income, expenses })),
        profitAndLoss: { from: fyStart, to: today(), ...ytd },
      };
    },

    invoices: bcInvoices(client, lcy, link),
    contacts: bcContacts(client),
    quotes: bcQuotes(client, lcy),
    creditNotes: bcCreditNotes(client, lcy),
    purchaseOrders: bcPurchaseOrders(client, lcy),
    items: bcItems(client),
    payments: bcPayments(client, lcy),
    bank,
    accounts: bcAccounts(client),
    journals: bcJournals(client),
    taxRates: bcTaxRates(client),
    assets: bcAssets(client),
    reports: bcReports(client, lcy),
    payroll: bcPayroll(client),
    projects: bcProjects(client, lcy),

    sourceLink(entity, id) {
      const pages = { invoice: 9301, bill: 9308, quote: 9300, contact: 22 };
      // Contacts open the Customers list (22), or the Vendors list (27) for `v:` ids.
      const page = entity === 'contact' && id.startsWith('v:') ? 27 : pages[entity];
      return bcWebClientLink(client.tenantId, client.environment, companyName, page);
    },
  };
}
