import 'server-only';
/**
 * The Bookie BC extension (`bc-extension/` in this repo): an optional Business Central
 * app that adds the custom API `api/knowallBookie/bookie/v1.0`, filling gaps in API v2.0
 * (bank balances and bank ledger entries, remaining amounts on bills, posted payments,
 * the company's LCY and fiscal year, and customer payment registration).
 *
 * Everything here is an *improvement*: each helper returns `undefined` when the
 * extension isn't installed (or a call to it fails), and the caller keeps its API v2.0
 * behaviour. Detection calls `companySetup` once per tenant, environment and company and
 * caches the answer for 10 minutes; a 404 means "not installed".
 */
import type {
  BankAccount,
  BankTransaction,
  InvoiceType,
  IsoDate,
  ListQuery,
  Page,
  Payment,
  PaymentInput,
} from '@/lib/domain/types';
import { ConnectorError } from '../types';
import { odataString, type BcClient, type ODataList } from './client';
import { decodeBcEnum } from './modules/accounts';

/** Route after `/api/` for the extension's pages (APIPublisher/APIGroup/APIVersion). */
export const BOOKIE_API = 'knowallBookie/bookie/v1.0';

export const DETECT_TTL_MS = 10 * 60 * 1000;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NULL_GUID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;

/** BC uses 0001-01-01 for "no date". */
function bcDate(value?: string): IsoDate | undefined {
  if (!value || value.startsWith('0001-01-01')) return undefined;
  return value.slice(0, 10);
}

function guid(value?: string): string | undefined {
  return value && GUID.test(value) && !NULL_GUID.test(value) ? value : undefined;
}

function requireGuid(value: string, what: string): string {
  if (!GUID.test(value)) throw new ConnectorError(`Unknown ${what} id.`, 400, 'business-central');
  return value;
}

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

/** `companySetup` as the extension returns it. */
export interface BcCompanySetup {
  id?: string;
  lcyCode?: string;
  localCurrencySymbol?: string;
  additionalReportingCurrency?: string;
  fiscalYearStartDate?: string;
  fiscalYearEndDate?: string;
  incomeStatementReport?: string;
  balanceSheetReport?: string;
  countryRegionCode?: string;
  vatRegistrationNumber?: string;
  registrationNumber?: string;
  extensionVersion?: string;
}

/** What Bookie knows once the extension is installed. Blank BC values are undefined. */
export interface BookieExtension {
  version?: string;
  /** General Ledger Setup "LCY Code". */
  lcyCode?: string;
  /** Start of the fiscal year today falls in, from the Accounting Periods. */
  fiscalYearStart?: IsoDate;
  fiscalYearEnd?: IsoDate;
  country?: string;
  vatNumber?: string;
  /** Financial report (row definition owner) General Ledger Setup uses for the P&L. */
  incomeStatementReport?: string;
  balanceSheetReport?: string;
}

export function fromBcCompanySetup(raw: BcCompanySetup): BookieExtension {
  return {
    version: raw.extensionVersion || undefined,
    lcyCode: raw.lcyCode || undefined,
    fiscalYearStart: bcDate(raw.fiscalYearStartDate),
    fiscalYearEnd: bcDate(raw.fiscalYearEndDate),
    country: raw.countryRegionCode || undefined,
    vatNumber: raw.vatRegistrationNumber || undefined,
    incomeStatementReport: raw.incomeStatementReport || undefined,
    balanceSheetReport: raw.balanceSheetReport || undefined,
  };
}

interface CacheEntry {
  expires: number;
  value: Promise<BookieExtension | undefined>;
}

const detected = new Map<string, CacheEntry>();

/** Cache key: the extension is installed per environment, its data is per company. */
export function extensionCacheKey(
  client: Pick<BcClient, 'tenantId' | 'environment' | 'companyId'>
): string {
  return [client.tenantId, client.environment?.toLowerCase(), client.companyId?.toLowerCase()].join(
    '|'
  );
}

/** Forget cached detections (tests; or after installing the extension). */
export function clearBookieExtensionCache(): void {
  detected.clear();
}

type Probe = { extension?: BookieExtension; cache: boolean };

async function probe(client: BcClient): Promise<Probe> {
  try {
    const body = await client.request<ODataList<BcCompanySetup>>('companySetup', {
      api: BOOKIE_API,
    });
    return { extension: fromBcCompanySetup(body.value?.[0] ?? {}), cache: true };
  } catch (error) {
    if (error instanceof ConnectorError) {
      // 404: the API route doesn't exist, so the extension isn't installed.
      // 403: installed, but this user hasn't got BOOKIE READ; behave as if absent.
      if (error.status === 404 || error.status === 403) return { cache: true };
    }
    // A failed sign-in or a transient error says nothing about the extension: don't cache.
    return { cache: false };
  }
}

/**
 * The Bookie BC extension for this client's company, or `undefined` when it isn't
 * installed (or can't be reached right now). Never throws.
 */
export function bookieExtension(
  client: BcClient,
  now: number = Date.now()
): Promise<BookieExtension | undefined> {
  const key = extensionCacheKey(client);
  const hit = detected.get(key);
  if (hit && hit.expires > now) return hit.value;
  const entry: CacheEntry = {
    expires: now + DETECT_TTL_MS,
    value: probe(client).then((result) => {
      if (!result.cache && detected.get(key) === entry) detected.delete(key);
      return result.extension;
    }),
  };
  detected.set(key, entry);
  return entry.value;
}

/* ------------------------------------------------------------------ */
/* Bank                                                                */
/* ------------------------------------------------------------------ */

export interface BcBankAccountBalance {
  id: string;
  number: string;
  displayName?: string;
  currencyCode?: string;
  blocked?: boolean;
  /** Bank ledger balance in the account's currency. */
  balance?: number;
  balanceLcy?: number;
  glAccountNumber?: string;
  glBalance?: number;
  glAccountShared?: boolean;
  lastStatementNumber?: string;
  lastStatementBalance?: number;
  lastStatementDate?: string;
  openReconciliationStatementNumber?: string;
  openReconciliationStatementDate?: string;
  openReconciliationEndingBalance?: number;
  unreconciledEntries?: number;
}

/** Add the extension's balances to an API v2.0 bank account. */
export function withBankBalance(account: BankAccount, raw: BcBankAccountBalance): BankAccount {
  const hasStatement = !!raw.lastStatementNumber;
  return {
    ...account,
    balance: raw.balance,
    // No posted statement yet means there is no statement balance, not a zero one.
    statementBalance: hasStatement ? raw.lastStatementBalance : undefined,
    statementDate: hasStatement ? bcDate(raw.lastStatementDate) : undefined,
    unreconciledCount: raw.unreconciledEntries,
  };
}

/** Balances by bank account id (the Bank Account SystemId API v2.0 uses), or undefined. */
export async function extensionBankBalances(
  client: BcClient
): Promise<Map<string, BcBankAccountBalance> | undefined> {
  if (!(await bookieExtension(client))) return undefined;
  try {
    const rows = await client.all<BcBankAccountBalance>('bankAccountBalances', {}, 2, BOOKIE_API);
    return new Map(rows.map((row) => [row.id.toLowerCase(), row]));
  } catch {
    return undefined;
  }
}

export interface BcBankLedgerEntry {
  id: string;
  entryNumber: number;
  bankAccountNumber: string;
  postingDate: string;
  documentType?: string;
  documentNumber?: string;
  externalDocumentNumber?: string;
  description?: string;
  /** Account currency; positive = money in. */
  amount: number;
  currencyCode?: string;
  open?: boolean;
  statementStatus?: string;
  statementNumber?: string;
  balAccountType?: string;
  balAccountNumber?: string;
  reversed?: boolean;
}

export function fromBcBankLedgerEntry(
  raw: BcBankLedgerEntry,
  account: { id: string; name?: string; currency: string }
): BankTransaction {
  const transfer = decodeBcEnum(raw.balAccountType) === 'Bank Account';
  const incoming = raw.amount >= 0;
  return {
    id: raw.id,
    bankAccountId: account.id,
    bankAccountName: account.name,
    date: bcDate(raw.postingDate) ?? '',
    type: incoming ? (transfer ? 'transfer-in' : 'receive') : transfer ? 'transfer-out' : 'spend',
    reference: raw.externalDocumentNumber || raw.documentNumber || undefined,
    description: raw.description || undefined,
    amount: Math.abs(raw.amount),
    currency: raw.currencyCode || account.currency,
    // Open bank ledger entries are the ones not yet applied in a bank reconciliation.
    isReconciled: raw.open === false,
    // A reversed entry and its reversal cancel out, like a voided transaction.
    status: raw.reversed ? 'deleted' : 'authorised',
  };
}

const DEFAULT_PAGE_SIZE = 50;

/** One bank account's posted transactions, newest first, or undefined without the extension. */
export async function extensionBankTransactions(
  client: BcClient,
  bankAccountId: string,
  query: ListQuery | undefined,
  lcy: () => Promise<string>
): Promise<Page<BankTransaction> | undefined> {
  if (!(await bookieExtension(client))) return undefined;
  const id = requireGuid(bankAccountId, 'bank account');
  const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = query?.page ?? 1;
  const [bank, currency] = await Promise.all([
    client.request<{ number: string; displayName?: string; currencyCode?: string }>(
      `bankAccounts(${id})`,
      { query: { $select: 'number,displayName,currencyCode' } }
    ),
    lcy(),
  ]);
  const filters = [`bankAccountNumber eq ${odataString(bank.number)}`];
  if (query?.from) filters.push(`postingDate ge ${query.from}`);
  if (query?.to) filters.push(`postingDate le ${query.to}`);
  if (query?.search) filters.push(`contains(description,${odataString(query.search)})`);
  let rows: BcBankLedgerEntry[];
  try {
    rows = (
      await client.request<ODataList<BcBankLedgerEntry>>('bankAccountLedgerEntries', {
        api: BOOKIE_API,
        query: {
          $filter: filters.join(' and '),
          $orderby: 'postingDate desc,entryNumber desc',
          $top: pageSize + 1,
          $skip: (page - 1) * pageSize,
        },
      })
    ).value;
  } catch {
    return undefined;
  }
  const account = { id, name: bank.displayName, currency: bank.currencyCode || currency };
  return {
    items: rows.slice(0, pageSize).map((row) => fromBcBankLedgerEntry(row, account)),
    page,
    pageSize,
    hasMore: rows.length > pageSize,
  };
}

/* ------------------------------------------------------------------ */
/* Bills: remaining amounts from the vendor ledger                     */
/* ------------------------------------------------------------------ */

export interface BcVendorLedgerEntry {
  id: string;
  entryNumber: number;
  vendorNumber: string;
  documentType?: string;
  documentNumber: string;
  /** Entry currency. Invoices are credits, so this is zero or negative. */
  remainingAmount: number;
  open?: boolean;
  currencyCode?: string;
}

/**
 * The amount still due on one bill, from its vendor ledger entries: undefined when there
 * is no entry, or more than one and the vendor number doesn't pick one out.
 */
export function billAmountDue(
  entries: BcVendorLedgerEntry[] | undefined,
  vendorNumber?: string
): number | undefined {
  if (!entries?.length) return undefined;
  const matches =
    vendorNumber && entries.length > 1
      ? entries.filter((e) => e.vendorNumber === vendorNumber)
      : entries;
  if (matches.length !== 1) return undefined;
  return Math.abs(matches[0].remainingAmount);
}

const BILL_BATCH = 15;

/**
 * Vendor ledger invoice entries for posted bill numbers, keyed by document number, or
 * undefined without the extension.
 */
export async function extensionBillRemaining(
  client: BcClient,
  numbers: string[]
): Promise<Map<string, BcVendorLedgerEntry[]> | undefined> {
  const unique = [...new Set(numbers.filter(Boolean))];
  if (!unique.length || !(await bookieExtension(client))) return undefined;
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += BILL_BATCH) batches.push(unique.slice(i, i + BILL_BATCH));
  try {
    const rows = (
      await Promise.all(
        batches.map((batch) =>
          client.all<BcVendorLedgerEntry>(
            'vendorLedgerEntries',
            {
              $filter: `documentType eq 'Invoice' and (${batch
                .map((n) => `documentNumber eq ${odataString(n)}`)
                .join(' or ')})`,
              $select:
                'id,entryNumber,vendorNumber,documentType,documentNumber,remainingAmount,open,currencyCode',
            },
            1,
            BOOKIE_API
          )
        )
      )
    ).flat();
    const byNumber = new Map<string, BcVendorLedgerEntry[]>();
    for (const row of rows) {
      byNumber.set(row.documentNumber, [...(byNumber.get(row.documentNumber) ?? []), row]);
    }
    return byNumber;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

export interface BcPostedPayment {
  id: string;
  entryNumber: number;
  postingDate: string;
  paymentNumber?: string;
  externalDocumentNumber?: string;
  customerNumber?: string;
  customerId?: string;
  customerName?: string;
  vendorNumber?: string;
  vendorId?: string;
  vendorName?: string;
  currencyCode?: string;
  /** Amount of the invoice or bill this payment settled, positive. */
  amount: number;
  invoiceNumber?: string;
  invoiceId?: string;
  bankAccountNumber?: string;
  bankAccountId?: string;
}

export function fromBcPostedPayment(
  raw: BcPostedPayment,
  type: InvoiceType,
  lcy: string,
  bankNames: Map<string, string> = new Map()
): Payment {
  const sales = type === 'sales';
  const partyId = guid(sales ? raw.customerId : raw.vendorId);
  const bankAccountId = guid(raw.bankAccountId);
  return {
    id: raw.id,
    date: bcDate(raw.postingDate) ?? '',
    amount: raw.amount,
    currency: raw.currencyCode || lcy,
    reference: raw.externalDocumentNumber || raw.paymentNumber || undefined,
    invoiceId: guid(raw.invoiceId),
    invoiceNumber: raw.invoiceNumber || undefined,
    invoiceType: type,
    contact: partyId
      ? {
          id: `${sales ? 'c' : 'v'}:${partyId}`,
          name:
            (sales ? raw.customerName || raw.customerNumber : raw.vendorName || raw.vendorNumber) ||
            '',
        }
      : undefined,
    bankAccountId,
    bankAccountName: bankAccountId ? bankNames.get(bankAccountId.toLowerCase()) : undefined,
    status: 'authorised',
  };
}

/**
 * Posted payments (applied to invoices and bills), newest first, or undefined without
 * the extension. API v2.0 only has unposted payment journal lines.
 */
export async function extensionPayments(
  client: BcClient,
  query: (ListQuery & { invoiceType?: InvoiceType }) | undefined,
  lcy: () => Promise<string>
): Promise<Page<Payment> | undefined> {
  if (!(await bookieExtension(client))) return undefined;
  const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = query?.page ?? 1;
  let types: InvoiceType[] = query?.invoiceType ? [query.invoiceType] : ['sales', 'purchase'];
  let partyNumber: string | undefined;
  if (query?.contactId) {
    const match = /^([cv]):(.+)$/i.exec(query.contactId);
    if (!match) throw new ConnectorError('Unknown contact id.', 400, 'business-central');
    const entity = match[1].toLowerCase() === 'c' ? 'customers' : 'vendors';
    types = types.filter((t) => (t === 'sales') === (entity === 'customers'));
    if (!types.length) return { items: [], page, pageSize, hasMore: false, total: 0 };
    const party = await client.request<{ number: string }>(
      `${entity}(${requireGuid(match[2], 'contact')})`,
      { query: { $select: 'number' } }
    );
    partyNumber = party.number;
  }
  try {
    const [currency, banks, lists] = await Promise.all([
      lcy(),
      client.all<{ id: string; displayName?: string }>('bankAccounts', {
        $select: 'id,displayName',
      }),
      Promise.all(
        types.map(async (type) => {
          const filters: string[] = [];
          if (query?.from) filters.push(`postingDate ge ${query.from}`);
          if (query?.to) filters.push(`postingDate le ${query.to}`);
          if (partyNumber) {
            filters.push(
              `${type === 'sales' ? 'customerNumber' : 'vendorNumber'} eq ${odataString(partyNumber)}`
            );
          }
          // Newest first; enough rows from each side to fill the requested page after merging.
          const rows = await client.request<ODataList<BcPostedPayment>>(
            type === 'sales' ? 'postedCustomerPayments' : 'postedVendorPayments',
            {
              api: BOOKIE_API,
              query: {
                $filter: filters.join(' and ') || undefined,
                $orderby: 'postingDate desc,entryNumber desc',
                $top: page * pageSize + 1,
              },
            }
          );
          return rows.value.map((row) => ({ type, row }));
        })
      ),
    ]);
    const bankNames = new Map(
      banks.filter((b) => b.displayName).map((b) => [b.id.toLowerCase(), b.displayName!])
    );
    const all = lists
      .flat()
      .map(({ type, row }) => fromBcPostedPayment(row, type, currency, bankNames))
      .sort((a, b) => b.date.localeCompare(a.date));
    return {
      items: all.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      hasMore: all.length > page * pageSize,
    };
  } catch {
    return undefined;
  }
}

/** Shown when someone tries to pay a bill: Payment Registration is for customer payments. */
export const BC_BILL_PAYMENT_NOTE =
  'Business Central registers customer payments only. Pay bills in Business Central with a payment journal.';

export interface BcPaymentRegistration {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  bankAccountId: string;
  bankAccountNumber: string;
  paymentDate: string;
  amount: number;
  externalDocumentNumber?: string;
  customerNumber: string;
  documentNumber: string;
  paymentLedgerEntryNumber: number;
  invoiceRemainingAmount: number;
  invoiceClosed: boolean;
}

export function toBcPaymentRegistration(input: PaymentInput) {
  const reference = input.reference?.trim();
  if (reference && reference.length > 35) {
    throw new ConnectorError(
      'Business Central payment references can be at most 35 characters.',
      400,
      'business-central'
    );
  }
  return {
    invoiceId: requireGuid(input.invoiceId, 'invoice'),
    bankAccountId: requireGuid(input.bankAccountId, 'bank account'),
    paymentDate: input.date,
    amount: input.amount,
    ...(reference ? { externalDocumentNumber: reference } : {}),
  };
}

export function fromBcPaymentRegistration(
  raw: BcPaymentRegistration,
  invoice: { customerId?: string; customerName?: string },
  lcy: string
): Payment {
  const customerId = guid(invoice.customerId);
  return {
    id: raw.id,
    date: bcDate(raw.paymentDate) ?? '',
    amount: raw.amount,
    // The extension only registers local-currency payments.
    currency: lcy,
    reference: raw.externalDocumentNumber || raw.documentNumber || undefined,
    invoiceId: guid(raw.invoiceId),
    invoiceNumber: raw.invoiceNumber || undefined,
    invoiceType: 'sales',
    contact: customerId ? { id: `c:${customerId}`, name: invoice.customerName ?? '' } : undefined,
    bankAccountId: guid(raw.bankAccountId),
    status: 'authorised',
  };
}

/**
 * Register a customer payment against a posted sales invoice through the extension's
 * paymentRegistrations page (one invoice, one transaction in BC). Bills are refused.
 */
export async function extensionRegisterPayment(
  client: BcClient,
  input: PaymentInput,
  lcy: () => Promise<string>
): Promise<Payment> {
  const body = toBcPaymentRegistration(input);
  const invoice = await client
    .request<{ id: string; customerId?: string; customerName?: string }>(
      `salesInvoices(${body.invoiceId})`,
      { query: { $select: 'id,customerId,customerName' } }
    )
    .catch((error) => {
      if (error instanceof ConnectorError && error.status === 404) {
        throw new ConnectorError(BC_BILL_PAYMENT_NOTE, 400, 'business-central');
      }
      throw error;
    });
  const raw = await client.request<BcPaymentRegistration>('paymentRegistrations', {
    method: 'POST',
    api: BOOKIE_API,
    body,
  });
  return fromBcPaymentRegistration(raw, invoice, await lcy());
}

/* ------------------------------------------------------------------ */
/* Financial reports (for the reports module)                          */
/* ------------------------------------------------------------------ */

export interface BcFinancialReportLine {
  id: string;
  rowDefinition: string;
  lineNumber: number;
  rowNumber?: string;
  description?: string;
  totalingType?: string;
  show?: string;
  indentation?: number;
  bold?: boolean;
  netChange: number;
  balanceAtDate: number;
}

export interface FinancialReportRow {
  rowNumber?: string;
  description: string;
  /** Net change over the period, signed as BC's report shows it. */
  netChange: number;
  balanceAtDate: number;
  indentation: number;
  bold: boolean;
  /** Row totals (formulas, totals) rather than posting accounts. */
  isTotal: boolean;
}

const TOTAL_ROWS = new Set([
  'Formula',
  'Total Accounts',
  'Cost Type Total',
  'Cash Flow Total Accounts',
]);

/** Whether BC prints a row, per its Show setting, judged on the net change column. */
function rowShown(row: BcFinancialReportLine): boolean {
  switch (decodeBcEnum(row.show)) {
    case 'No':
      return false;
    case 'If Any Column Not Zero':
      return row.netChange !== 0;
    case 'When Positive Balance':
      return row.netChange > 0;
    case 'When Negative Balance':
      return row.netChange < 0;
    default:
      return true;
  }
}

/** Rows BC would print, in report order. */
export function fromBcFinancialReportLines(rows: BcFinancialReportLine[]): FinancialReportRow[] {
  return [...rows]
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .filter(rowShown)
    .map((row) => {
      const totaling = decodeBcEnum(row.totalingType);
      return {
        rowNumber: row.rowNumber || undefined,
        description: row.description ?? '',
        netChange: row.netChange,
        balanceAtDate: row.balanceAtDate,
        indentation: row.indentation ?? 0,
        bold: !!row.bold,
        isTotal: TOTAL_ROWS.has(totaling),
      };
    });
}

/**
 * One financial report row definition calculated for a period by BC's own engine, so a
 * P&L can follow the company's report setup. Undefined without the extension.
 */
export async function extensionFinancialReport(
  client: BcClient,
  rowDefinition: string,
  from: IsoDate,
  to: IsoDate
): Promise<FinancialReportRow[] | undefined> {
  if (!(await bookieExtension(client))) return undefined;
  try {
    const rows = await client.all<BcFinancialReportLine>(
      'financialReportLines',
      {
        $filter: `rowDefinition eq ${odataString(rowDefinition)} and dateFilter ge ${from} and dateFilter le ${to}`,
      },
      2,
      BOOKIE_API
    );
    return fromBcFinancialReportLines(rows);
  } catch {
    return undefined;
  }
}
