import 'server-only';
import type {
  Contact,
  DashboardSummary,
  Invoice,
  InvoiceType,
  ListQuery,
  OrgDetails,
  OrgRef,
  Page,
  Report,
} from '@/lib/domain/types';
import type { AccountingConnector, ContactsModule, InvoicesModule } from '../types';
import { XeroClient, xeroString } from './client';
import {
  fromXeroContact,
  fromXeroInvoice,
  today,
  toXeroContact,
  keepOtherXeroEntries,
  toXeroInvoice,
  XERO_INVOICE_STATUS,
  type XeroContact,
  type XeroInvoice,
} from './mappers';
import { findReportValue, fromXeroReport, type XeroReport } from './reports';
import { invoiceBuckets } from '../buckets';
import { xeroQuotes } from './modules/quotes';
import { xeroCreditNotes } from './modules/credit-notes';
import { xeroPurchaseOrders } from './modules/purchase-orders';
import { xeroItems } from './modules/items';
import { xeroPayments } from './modules/payments';
import { xeroBank } from './modules/bank';
import { xeroAccounts } from './modules/accounts';
import { xeroJournals } from './modules/journals';
import { xeroTaxRates } from './modules/tax-rates';
import { xeroAssets } from './modules/assets';
import { xeroReports } from './modules/reports';
import { xeroPayroll } from './modules/payroll';
import { xeroProjects } from './modules/projects';
import { xeroActivity } from './modules/activity';
import { xeroAttachments } from './modules/attachments';
import { xeroCapture } from './modules/capture';
import { xeroCurrencies } from './modules/currencies';
import { fromXeroOrganisation, xeroUsers, type XeroOrganisation } from './modules/organisation';
import { xeroHistory } from './modules/history';
import { xeroInvoiceExtras } from './modules/invoice-extras';
import { xeroReconcile } from './modules/reconcile';

const DEFAULT_PAGE_SIZE = 50;

export function pageOf<T>(items: T[], query: ListQuery | undefined, pageSize: number): Page<T> {
  return {
    items,
    page: query?.page ?? 1,
    pageSize,
    hasMore: items.length >= pageSize,
  };
}

/** Xero deep links go through organisationlogin so the right org opens. */
export function xeroDeepLink(shortCode: string | undefined, redirect: string): string | undefined {
  if (!shortCode) return undefined;
  return `https://go.xero.com/organisationlogin/default.aspx?shortcode=${encodeURIComponent(shortCode)}&redirecturl=${encodeURIComponent(redirect)}`;
}

function invoiceStatusFilter(status?: string): string | undefined {
  if (!status || status === 'all') return 'DRAFT,SUBMITTED,AUTHORISED,PAID';
  if (status === 'overdue') return 'AUTHORISED';
  const mapped = XERO_INVOICE_STATUS[status as keyof typeof XERO_INVOICE_STATUS];
  return mapped;
}

function xeroInvoices(client: XeroClient, shortCode?: string): InvoicesModule {
  const link = (invoice: Invoice): Invoice => ({
    ...invoice,
    sourceUrl: xeroDeepLink(
      shortCode,
      invoice.type === 'sales'
        ? `/AccountsReceivable/View.aspx?InvoiceID=${invoice.id}`
        : `/AccountsPayable/View.aspx?InvoiceID=${invoice.id}`
    ),
  });

  const getOne = async (id: string) => {
    const result = await client.request<{ Invoices: XeroInvoice[] }>(`Invoices/${id}`);
    return link(fromXeroInvoice(result.Invoices[0]));
  };

  const save = async (body: Record<string, unknown>) => {
    const result = await client.request<{ Invoices: XeroInvoice[] }>('Invoices', {
      method: 'POST',
      body: { Invoices: [body] },
    });
    return link(fromXeroInvoice(result.Invoices[0]));
  };

  return {
    async list(type: InvoiceType, query?: ListQuery) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const where = [`Type=="${type === 'sales' ? 'ACCREC' : 'ACCPAY'}"`];
      if (query?.status === 'overdue')
        where.push(`DueDate<DateTime(${today().replaceAll('-', ',')})`);
      if (query?.from) where.push(`Date>=DateTime(${query.from.replaceAll('-', ',')})`);
      if (query?.to) where.push(`Date<=DateTime(${query.to.replaceAll('-', ',')})`);
      const result = await client.request<{ Invoices: XeroInvoice[] }>('Invoices', {
        query: {
          where: where.join(' AND '),
          Statuses: invoiceStatusFilter(query?.status),
          ContactIDs: query?.contactId,
          SearchTerm: query?.search ? xeroString(query.search) : undefined,
          order: 'Date DESC',
          page: query?.page ?? 1,
          pageSize,
          summaryOnly: true,
        },
      });
      return pageOf(result.Invoices.map(fromXeroInvoice).map(link), query, pageSize);
    },
    get: getOne,
    create: (input) => save(toXeroInvoice(input)),
    update: (id, input) => save(toXeroInvoice(input, id)),
    approve: (id) => save({ InvoiceID: id, Status: 'AUTHORISED' }),
    void: (id) => save({ InvoiceID: id, Status: 'VOIDED' }),
    async delete(id) {
      await save({ InvoiceID: id, Status: 'DELETED' });
    },
    async email(id) {
      await client.request(`Invoices/${id}/Email`, { method: 'POST', body: {} });
    },
    pdf: (id) => client.request<ArrayBuffer>(`Invoices/${id}`, { accept: 'application/pdf' }),
    ...xeroInvoiceExtras(client, link),
  };
}

/** Query parameters for GET Contacts. Exported for tests. */
export function xeroContactsQuery(
  query: Parameters<ContactsModule['list']>[0],
  pageSize: number
): Record<string, string | number | boolean | undefined> {
  const where: string[] = [];
  if (query?.role === 'customer') where.push('IsCustomer==true');
  if (query?.role === 'supplier') where.push('IsSupplier==true');
  const archivedOnly = query?.status === 'archived';
  if (archivedOnly) where.push('ContactStatus=="ARCHIVED"');
  return {
    where: where.join(' AND ') || undefined,
    // searchTerm is a plain query parameter (not a where clause): no escaping needed.
    // Xero matches it against name, first/last name, contact number and email.
    searchTerm: query?.search?.trim() || undefined,
    includeArchived: archivedOnly || query?.includeArchived ? true : undefined,
    order: 'Name ASC',
    page: query?.page ?? 1,
    pageSize,
    // Full rows carry Balances (omitted by Xero when zero) without an N+1 per contact.
    summaryOnly: false,
  };
}

function xeroContacts(client: XeroClient): ContactsModule {
  const one = async (id: string) => {
    const result = await client.request<{ Contacts: XeroContact[] }>(
      `Contacts/${encodeURIComponent(id)}`
    );
    return fromXeroContact(result.Contacts[0], true, true);
  };
  const save = async (body: Record<string, unknown>): Promise<Contact> => {
    const result = await client.request<{ Contacts: XeroContact[] }>('Contacts', {
      method: 'POST',
      body: { Contacts: [body] },
    });
    return fromXeroContact(result.Contacts[0], true);
  };
  return {
    async list(query) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const result = await client.request<{ Contacts: XeroContact[] }>('Contacts', {
        query: xeroContactsQuery(query, pageSize),
      });
      return pageOf(
        result.Contacts.map((c) => fromXeroContact(c, true)),
        query,
        pageSize
      );
    },
    get: one,
    create: (input) => save(toXeroContact(input)),
    async update(id, input) {
      const body = toXeroContact(input, id);
      if (!body.Addresses && !body.Phones) return save(body);
      const current = await client.request<{ Contacts: XeroContact[] }>(
        `Contacts/${encodeURIComponent(id)}`
      );
      return save(keepOtherXeroEntries(body, current.Contacts[0]));
    },
    archive: (id) => save({ ContactID: id, ContactStatus: 'ARCHIVED' }),
  };
}

/** Every unpaid (draft, awaiting approval, awaiting payment) invoice of one type, all pages. */
async function unpaidInvoices(client: XeroClient, type: 'ACCREC' | 'ACCPAY') {
  const all: XeroInvoice[] = [];
  for (let page = 1; page <= 50; page++) {
    const result = await client.request<{ Invoices: XeroInvoice[] }>('Invoices', {
      query: {
        where: `Type=="${type}"`,
        Statuses: 'DRAFT,SUBMITTED,AUTHORISED',
        summaryOnly: true,
        pageSize: 1000,
        page,
      },
    });
    all.push(...result.Invoices);
    if (result.Invoices.length < 1000) break;
  }
  return all.map(fromXeroInvoice);
}

/**
 * Start of the financial year containing `on`, from Xero's financial year end.
 * Undefined when Xero doesn't give the year end (never assume 31 December).
 */
export function financialYearStart(
  endDay: number | undefined,
  endMonth: number | undefined,
  on: string
): string | undefined {
  if (!endDay || !endMonth) return undefined;
  const year = Number(on.slice(0, 4));
  const endOf = (y: number) =>
    new Date(Date.UTC(y, endMonth - 1, endDay)).toISOString().slice(0, 10);
  // The FY starts the day after the most recent year end before `on`.
  const lastEnd = endOf(year) < on ? endOf(year) : endOf(year - 1);
  const start = new Date(`${lastEnd}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString().slice(0, 10);
}

function monthEnd(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}

/**
 * Income, expenses and net for one P&L column. Xero leaves out sections with
 * no transactions, so a missing "Total Income" really is zero; but without a
 * Net Profit line the column can't be read, and it is undefined.
 */
export function incomeAndExpenses(report: Report, column: number) {
  const net = findReportValue(report, /^Net Profit$/i, column);
  if (net === undefined) return undefined;
  const income =
    (findReportValue(report, /^Total Income$/i, column) ?? 0) +
    (findReportValue(report, /^Total Other Income$/i, column) ?? 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return { income: round(income), expenses: round(income - net), net };
}

export interface XeroConnectorOptions {
  org: OrgRef;
  client: XeroClient;
  shortCode?: string;
}

export function createXeroConnector({
  org,
  client,
  shortCode,
}: XeroConnectorOptions): AccountingConnector {
  let organisation: Promise<OrgDetails> | undefined;
  const getOrganisation = () =>
    (organisation ??= client
      .request<{ Organisations: XeroOrganisation[] }>('Organisation')
      .then(({ Organisations: [o] }) =>
        fromXeroOrganisation(o, xeroDeepLink(o.ShortCode ?? shortCode, '/Dashboard/'))
      ));

  const runReport = async (name: string, query: Record<string, string | number | undefined>) => {
    const result = await client.request<{ Reports: XeroReport[] }>(`Reports/${name}`, { query });
    return result.Reports[0];
  };

  const connector: AccountingConnector = {
    kind: 'xero',
    org,
    organisation: getOrganisation,

    async dashboard(): Promise<DashboardSummary> {
      const details = await getOrganisation();
      const now = new Date();
      const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const base = details.baseCurrency ?? '';
      const fyStart = financialYearStart(
        details.financialYearEndDay,
        details.financialYearEndMonth,
        today()
      );
      const [sales, bills, bankSummary, trendReport, ytdReport] = await Promise.all([
        unpaidInvoices(client, 'ACCREC'),
        unpaidInvoices(client, 'ACCPAY'),
        runReport('BankSummary', {
          fromDate: thisMonthStart.toISOString().slice(0, 10),
          toDate: today(),
        }),
        runReport('ProfitAndLoss', {
          fromDate: thisMonthStart.toISOString().slice(0, 10),
          toDate: monthEnd(now.getUTCFullYear(), now.getUTCMonth()),
          periods: 11,
          timeframe: 'MONTH',
        }),
        fyStart
          ? runReport('ProfitAndLoss', { fromDate: fyStart, toDate: today() })
          : Promise.resolve(undefined),
      ]);

      // Bank Summary amounts are all in the base currency (the report totals them),
      // including foreign-currency accounts.
      const bank = fromXeroReport('bank-summary', bankSummary);
      const bankAccounts = bank.sections
        .flatMap((s) => s.rows)
        .filter((r) => r.kind === 'row' && r.accountId)
        .map((r) => ({
          id: r.accountId!,
          name: String(r.cells[0]),
          currency: base,
          balance: typeof r.cells[4] === 'number' ? r.cells[4] : undefined,
        }));

      const trend = fromXeroReport('profit-and-loss', trendReport);
      const months = trend.columns.slice(1).map((_, i) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        return { month: d.toISOString().slice(0, 7), values: incomeAndExpenses(trend, i + 1) };
      });
      const trendKnown = months.length > 0 && months.every((m) => m.values);

      const ytdValues = ytdReport
        ? incomeAndExpenses(fromXeroReport('profit-and-loss', ytdReport), 1)
        : undefined;

      return {
        currency: base,
        bankAccounts,
        receivables: invoiceBuckets(sales, base),
        payables: invoiceBuckets(bills, base),
        trend: trendKnown
          ? months.reverse().map(({ month, values }) => ({
              month,
              income: values!.income,
              expenses: values!.expenses,
            }))
          : [],
        profitAndLoss:
          fyStart && ytdValues ? { from: fyStart, to: today(), ...ytdValues } : undefined,
        notes: {
          trend: trendKnown ? undefined : "Xero's profit and loss had no Net Profit line to read.",
          profitAndLoss: !fyStart
            ? "Xero didn't return the organisation's financial year end."
            : ytdValues
              ? undefined
              : "Xero's profit and loss had no Net Profit line to read.",
        },
      };
    },

    activity: xeroActivity(client),
    invoices: xeroInvoices(client, shortCode),
    contacts: xeroContacts(client),
    quotes: xeroQuotes(client, shortCode),
    creditNotes: xeroCreditNotes(client, shortCode),
    purchaseOrders: xeroPurchaseOrders(client),
    items: xeroItems(client),
    payments: xeroPayments(client),
    bank: {
      ...xeroBank(
        client,
        async () => (await getOrganisation()).baseCurrency,
        xeroDeepLink(shortCode, '/Dashboard/')
      ),
      reconcile: xeroReconcile(shortCode),
    },
    accounts: xeroAccounts(client),
    journals: xeroJournals(client),
    taxRates: xeroTaxRates(client),
    currencies: xeroCurrencies(client),
    assets: xeroAssets(client),
    reports: xeroReports(client),
    payroll: xeroPayroll(client),
    projects: xeroProjects(client),
    attachments: xeroAttachments(client),
    capture: xeroCapture(client, shortCode),
    users: xeroUsers(client),
    history: xeroHistory(client),

    sourceLink(entity, id) {
      const paths = {
        invoice: `/AccountsReceivable/View.aspx?InvoiceID=${id}`,
        bill: `/AccountsPayable/View.aspx?InvoiceID=${id}`,
        quote: `/Accounts/Receivable/Quotes/View/${id}`,
        contact: `/Contacts/View/${id}`,
      };
      return xeroDeepLink(shortCode, paths[entity]);
    },
  };
  return connector;
}
