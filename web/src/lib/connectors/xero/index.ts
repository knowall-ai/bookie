import 'server-only';
import type {
  Contact,
  DashboardSummary,
  DocumentBucket,
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
  toXeroInvoice,
  XERO_INVOICE_STATUS,
  type XeroContact,
  type XeroInvoice,
} from './mappers';
import { findReportValue, fromXeroReport, type XeroReport } from './reports';
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

const DEFAULT_PAGE_SIZE = 50;

export function pageOf<T>(items: T[], query: ListQuery | undefined, pageSize: number): Page<T> {
  return {
    items,
    page: query?.page ?? 1,
    pageSize,
    hasMore: items.length >= pageSize,
  };
}

interface XeroOrganisation {
  Name: string;
  LegalName?: string;
  CountryCode?: string;
  BaseCurrency: string;
  TaxNumber?: string;
  RegistrationNumber?: string;
  FinancialYearEndDay?: number;
  FinancialYearEndMonth?: number;
  Timezone?: string;
  ShortCode?: string;
  Addresses?: {
    AddressType?: string;
    AddressLine1?: string;
    AddressLine2?: string;
    City?: string;
    Region?: string;
    PostalCode?: string;
    Country?: string;
  }[];
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
    return fromXeroContact(result.Contacts[0], true);
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
    update: (id, input) => save(toXeroContact(input, id)),
    archive: (id) => save({ ContactID: id, ContactStatus: 'ARCHIVED' }),
  };
}

function bucket(): DocumentBucket {
  return { count: 0, total: 0 };
}

async function summariseInvoices(client: XeroClient, type: 'ACCREC' | 'ACCPAY') {
  const result = await client.request<{ Invoices: XeroInvoice[] }>('Invoices', {
    query: {
      where: `Type=="${type}"`,
      Statuses: 'DRAFT,SUBMITTED,AUTHORISED',
      summaryOnly: true,
      pageSize: 1000,
    },
  });
  const summary = {
    draft: bucket(),
    awaitingApproval: bucket(),
    awaitingPayment: bucket(),
    overdue: bucket(),
  };
  for (const raw of result.Invoices) {
    const invoice = fromXeroInvoice(raw);
    const target =
      invoice.status === 'draft'
        ? summary.draft
        : invoice.status === 'submitted'
          ? summary.awaitingApproval
          : summary.awaitingPayment;
    target.count += 1;
    target.total += invoice.status === 'authorised' ? invoice.amountDue : invoice.total;
    if (invoice.isOverdue) {
      summary.overdue.count += 1;
      summary.overdue.total += invoice.amountDue;
    }
  }
  return summary;
}

function financialYearStart(endDay = 31, endMonth = 12, on = new Date()): string {
  // The FY starts the day after the previous year-end.
  let year = on.getUTCFullYear();
  const endThisYear = new Date(Date.UTC(year, endMonth - 1, endDay));
  if (on <= endThisYear) year -= 1;
  const start = new Date(Date.UTC(year, endMonth - 1, endDay + 1));
  return start.toISOString().slice(0, 10);
}

function monthEnd(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}

function incomeAndExpenses(report: Report, column: number) {
  const income =
    (findReportValue(report, /^Total Income$/i, column) ?? 0) +
    (findReportValue(report, /^Total Other Income$/i, column) ?? 0);
  const net = findReportValue(report, /^Net Profit$/i, column) ?? 0;
  return { income, expenses: income - net, net };
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
      .then(({ Organisations: [o] }) => {
        const a = o.Addresses?.find((x) => x.AddressLine1) ?? o.Addresses?.[0];
        return {
          name: o.Name,
          legalName: o.LegalName,
          country: o.CountryCode,
          baseCurrency: o.BaseCurrency,
          taxNumber: o.TaxNumber,
          registrationNumber: o.RegistrationNumber,
          financialYearEndDay: o.FinancialYearEndDay,
          financialYearEndMonth: o.FinancialYearEndMonth,
          timezone: o.Timezone,
          address: a
            ? {
                line1: a.AddressLine1,
                line2: a.AddressLine2,
                city: a.City,
                region: a.Region,
                postalCode: a.PostalCode,
                country: a.Country,
              }
            : undefined,
          sourceUrl: xeroDeepLink(o.ShortCode ?? shortCode, '/Dashboard/'),
        } satisfies OrgDetails;
      }));

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
      const [receivables, payables, bankSummary, trendReport, ytdReport] = await Promise.all([
        summariseInvoices(client, 'ACCREC'),
        summariseInvoices(client, 'ACCPAY'),
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
        runReport('ProfitAndLoss', {
          fromDate: financialYearStart(
            details.financialYearEndDay,
            details.financialYearEndMonth,
            now
          ),
          toDate: today(),
        }),
      ]);

      const bank = fromXeroReport('bank-summary', bankSummary);
      const bankAccounts = bank.sections
        .flatMap((s) => s.rows)
        .filter((r) => r.kind === 'row' && r.accountId)
        .map((r) => ({
          id: r.accountId!,
          name: String(r.cells[0]),
          currency: details.baseCurrency,
          balance: typeof r.cells[4] === 'number' ? r.cells[4] : undefined,
        }));

      const trend = fromXeroReport('profit-and-loss', trendReport);
      const months = trend.columns.slice(1).map((_, i) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        return { month: d.toISOString().slice(0, 7), ...incomeAndExpenses(trend, i + 1) };
      });

      const ytd = fromXeroReport('profit-and-loss', ytdReport);
      const ytdValues = incomeAndExpenses(ytd, 1);

      return {
        currency: details.baseCurrency,
        bankAccounts,
        receivables,
        payables,
        trend: months.reverse().map(({ month, income, expenses }) => ({ month, income, expenses })),
        profitAndLoss: {
          from: financialYearStart(details.financialYearEndDay, details.financialYearEndMonth, now),
          to: today(),
          ...ytdValues,
        },
      };
    },

    invoices: xeroInvoices(client, shortCode),
    contacts: xeroContacts(client),
    quotes: xeroQuotes(client, shortCode),
    creditNotes: xeroCreditNotes(client),
    purchaseOrders: xeroPurchaseOrders(client),
    items: xeroItems(client),
    payments: xeroPayments(client),
    bank: xeroBank(client),
    accounts: xeroAccounts(client),
    journals: xeroJournals(client),
    taxRates: xeroTaxRates(client),
    assets: xeroAssets(client),
    reports: xeroReports(client),
    payroll: xeroPayroll(client),
    projects: xeroProjects(client),

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
