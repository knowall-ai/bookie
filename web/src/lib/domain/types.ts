/**
 * Bookie's accounting domain model.
 *
 * Every connector (Xero, Business Central, and future ones such as full Dynamics
 * or a SharePoint-hosted ledger) maps its own API into these shapes, so the
 * portal UI and the Bookie agent never see a vendor-specific payload.
 *
 * Conventions:
 * - Money is a plain decimal `number` in the document's own currency.
 * - Dates are ISO-8601 date strings (`YYYY-MM-DD`); timestamps are full ISO strings.
 * - Ids are the source system's ids, opaque to the UI.
 * - No guessing: a figure, status, currency or date the source didn't provide
 *   is `undefined` (or the explicit `'unknown'` status), never a default. The
 *   UI then says "not available" instead of inventing a value.
 */

export type ConnectorKind = 'xero' | 'business-central' | 'demo';

export type IsoDate = string;

export interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

/* ------------------------------------------------------------------ */
/* Organisation                                                        */
/* ------------------------------------------------------------------ */

/** One organisation (Xero org or BC company) the signed-in user can switch to. */
export interface OrgRef {
  /** Stable key used in URLs: `/portal/{key}/...`. Never contains secrets. */
  key: string;
  kind: ConnectorKind;
  name: string;
  /** Short label for the source, e.g. "Xero" or "Business Central · Production". */
  sourceLabel: string;
  country?: string;
  baseCurrency?: string;
  /** Business Central environment name. */
  environment?: string;
}

export interface OrgDetails {
  name: string;
  legalName?: string;
  country?: string;
  /** Undefined when the source doesn't say (e.g. a BC company with no LCY code set up). */
  baseCurrency?: string;
  taxNumber?: string;
  registrationNumber?: string;
  financialYearEndDay?: number;
  financialYearEndMonth?: number;
  timezone?: string;
  address?: Address;
  /** Deep link to open this org in its source system (Xero / BC web client). */
  sourceUrl?: string;
}

/* ------------------------------------------------------------------ */
/* Paging and queries                                                  */
/* ------------------------------------------------------------------ */

export interface ListQuery {
  page?: number; // 1-based
  pageSize?: number;
  search?: string;
  status?: string;
  from?: IsoDate;
  to?: IsoDate;
  contactId?: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  total?: number;
  /** Shown above the list when the source can only partly answer (e.g. no API for posted items). */
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Contacts and items                                                  */
/* ------------------------------------------------------------------ */

export interface ContactRef {
  id: string;
  name: string;
}

export interface Contact {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  website?: string;
  accountNumber?: string;
  taxNumber?: string;
  address?: Address;
  isCustomer: boolean;
  isSupplier: boolean;
  status: 'active' | 'archived';
  currency?: string;
  /**
   * Outstanding balances, when the source provides them cheaply, in the
   * organisation's base currency (not the contact's own currency). A missing
   * field means the source doesn't report it.
   */
  balances?: {
    receivable?: number;
    payable?: number;
    overdueReceivable?: number;
    overduePayable?: number;
  };
  /**
   * Why the balances are missing when the source gives a figure that can't be put in one
   * currency (BC sums a foreign-currency contact's entries without converting them).
   */
  balancesNote?: string;
  updatedAt?: string;
}

export interface ContactInput {
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  website?: string;
  accountNumber?: string;
  taxNumber?: string;
  address?: Address;
  isCustomer?: boolean;
  isSupplier?: boolean;
}

export interface Item {
  id: string;
  code: string;
  name: string;
  description?: string;
  salePrice?: number;
  salesAccountCode?: string;
  purchasePrice?: number;
  purchaseAccountCode?: string;
  isSold: boolean;
  isPurchased: boolean;
  isTracked?: boolean;
  quantityOnHand?: number;
}

export interface ItemInput {
  code: string;
  name: string;
  description?: string;
  salePrice?: number;
  salesAccountCode?: string;
  purchasePrice?: number;
  purchaseAccountCode?: string;
}

/* ------------------------------------------------------------------ */
/* Documents: invoices, bills, quotes, credit notes, purchase orders   */
/* ------------------------------------------------------------------ */

export type LineAmountType = 'exclusive' | 'inclusive' | 'none';

export interface LineItem {
  id?: string;
  itemCode?: string;
  description: string;
  quantity: number;
  unitAmount: number;
  discountRate?: number;
  accountCode?: string;
  taxType?: string;
  taxAmount?: number;
  lineAmount: number;
}

export interface LineItemInput {
  itemCode?: string;
  description: string;
  quantity: number;
  unitAmount: number;
  discountRate?: number;
  accountCode?: string;
  taxType?: string;
}

/** `sales` = Xero ACCREC / BC sales invoice; `purchase` = bill (ACCPAY / BC purchase invoice). */
export type InvoiceType = 'sales' | 'purchase';

export type InvoiceStatus =
  | 'draft'
  | 'submitted' // awaiting approval
  | 'authorised' // awaiting payment
  | 'paid'
  | 'voided'
  | 'deleted';

export interface Invoice {
  id: string;
  type: InvoiceType;
  number: string;
  reference?: string;
  contact: ContactRef;
  date: IsoDate;
  dueDate?: IsoDate;
  status: InvoiceStatus;
  currency: string;
  /**
   * The source's exchange rate for a foreign-currency document: units of `currency`
   * per one unit of the base currency (Xero `CurrencyRate`). Undefined when the
   * source doesn't provide one (Business Central's API has none).
   */
  currencyRate?: number;
  lineAmountType?: LineAmountType;
  subTotal: number;
  totalTax: number;
  total: number;
  /**
   * What's left to pay and what has been paid. Undefined when the source
   * doesn't report it (BC purchase invoices without the Bookie BC extension):
   * never assume "open means fully unpaid".
   */
  amountDue?: number;
  amountPaid?: number;
  amountCredited?: number;
  isOverdue: boolean;
  /** Only populated by `get`, not by `list`. */
  lineItems?: LineItem[];
  payments?: PaymentRef[];
  sentToContact?: boolean;
  updatedAt?: string;
  sourceUrl?: string;
}

export interface InvoiceInput {
  type: InvoiceType;
  contactId: string;
  date: IsoDate;
  dueDate?: IsoDate;
  number?: string;
  reference?: string;
  currency?: string;
  /** Units of `currency` per one base-currency unit; omit to let the source apply its own rate. */
  currencyRate?: number;
  lineAmountType?: LineAmountType;
  lineItems: LineItemInput[];
  /** Create as draft (default) or submit straight to awaiting approval / payment. */
  status?: 'draft' | 'submitted' | 'authorised';
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'invoiced' | 'deleted';

export interface Quote {
  id: string;
  number: string;
  reference?: string;
  title?: string;
  summary?: string;
  contact: ContactRef;
  date: IsoDate;
  expiryDate?: IsoDate;
  status: QuoteStatus;
  currency: string;
  /**
   * The source's exchange rate for a foreign-currency document: units of `currency`
   * per one unit of the base currency (Xero `CurrencyRate`). Undefined when the
   * source doesn't provide one (Business Central's API has none).
   */
  currencyRate?: number;
  lineAmountType?: LineAmountType;
  subTotal: number;
  totalTax: number;
  total: number;
  lineItems?: LineItem[];
  terms?: string;
  updatedAt?: string;
  sourceUrl?: string;
}

export interface QuoteInput {
  contactId: string;
  date: IsoDate;
  expiryDate?: IsoDate;
  number?: string;
  reference?: string;
  title?: string;
  summary?: string;
  terms?: string;
  currency?: string;
  /** Units of `currency` per one base-currency unit; omit to let the source apply its own rate. */
  currencyRate?: number;
  lineAmountType?: LineAmountType;
  lineItems: LineItemInput[];
}

export type CreditNoteType = 'sales' | 'purchase';

export interface CreditNote {
  id: string;
  type: CreditNoteType;
  number: string;
  reference?: string;
  contact: ContactRef;
  date: IsoDate;
  status: InvoiceStatus;
  currency: string;
  /**
   * The source's exchange rate for a foreign-currency document: units of `currency`
   * per one unit of the base currency (Xero `CurrencyRate`). Undefined when the
   * source doesn't provide one (Business Central's API has none).
   */
  currencyRate?: number;
  subTotal: number;
  totalTax: number;
  total: number;
  /** Undefined when the source doesn't report how much credit is left (BC open credit memos). */
  remainingCredit?: number;
  lineItems?: LineItem[];
  sourceUrl?: string;
}

export type PurchaseOrderStatus = 'draft' | 'submitted' | 'authorised' | 'billed' | 'deleted';

export interface PurchaseOrder {
  id: string;
  number: string;
  reference?: string;
  contact: ContactRef;
  date: IsoDate;
  deliveryDate?: IsoDate;
  status: PurchaseOrderStatus;
  currency: string;
  /**
   * The source's exchange rate for a foreign-currency document: units of `currency`
   * per one unit of the base currency (Xero `CurrencyRate`). Undefined when the
   * source doesn't provide one (Business Central's API has none).
   */
  currencyRate?: number;
  subTotal: number;
  totalTax: number;
  total: number;
  lineItems?: LineItem[];
  sourceUrl?: string;
}

export interface PurchaseOrderInput {
  contactId: string;
  date: IsoDate;
  deliveryDate?: IsoDate;
  reference?: string;
  currency?: string;
  /** Units of `currency` per one base-currency unit; omit to let the source apply its own rate. */
  currencyRate?: number;
  lineAmountType?: LineAmountType;
  lineItems: LineItemInput[];
}

/** A currency the organisation can trade in (Xero Currencies / BC currencies). */
export interface Currency {
  code: string;
  name?: string;
}

/* ------------------------------------------------------------------ */
/* Payments and bank                                                   */
/* ------------------------------------------------------------------ */

export interface PaymentRef {
  id: string;
  date: IsoDate;
  amount: number;
  reference?: string;
}

export interface Payment {
  id: string;
  date: IsoDate;
  /** In the document's currency (`currency`). */
  amount: number;
  currency?: string;
  /** What reached the bank account, in its currency, when the source reports it (Xero `BankAmount`). */
  bankAmount?: number;
  bankCurrency?: string;
  /** The source's rate for this payment (units of `currency` per base unit). */
  currencyRate?: number;
  reference?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceType?: InvoiceType;
  contact?: ContactRef;
  bankAccountId?: string;
  bankAccountName?: string;
  status: 'authorised' | 'deleted';
}

export interface PaymentInput {
  invoiceId: string;
  bankAccountId: string;
  date: IsoDate;
  /** In the document's currency. */
  amount: number;
  reference?: string;
  /** Foreign-currency documents only: units of document currency per base unit; omit for the source's own rate. */
  currencyRate?: number;
}

export interface BankAccount {
  id: string;
  name: string;
  code?: string;
  accountNumber?: string;
  currency: string;
  /** Balance per the ledger (Xero "Balance in Xero" / BC G/L balance). */
  balance?: number;
  /**
   * Currency `balance` is in, when it isn't the account's own currency (Xero's
   * Bank Summary gives foreign-currency accounts' balances in base currency).
   */
  balanceCurrency?: string;
  /** Balance per the latest bank statement, when available. */
  statementBalance?: number;
  statementDate?: IsoDate;
  unreconciledCount?: number;
  type?: 'bank' | 'credit-card' | 'paypal' | 'other';
}

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  bankAccountName?: string;
  date: IsoDate;
  type: 'receive' | 'spend' | 'transfer-in' | 'transfer-out';
  contact?: ContactRef;
  reference?: string;
  description?: string;
  amount: number;
  currency?: string;
  isReconciled: boolean;
  status: 'authorised' | 'deleted';
  lineItems?: LineItem[];
}

export interface BankTransactionInput {
  bankAccountId: string;
  type: 'receive' | 'spend';
  contactId: string;
  date: IsoDate;
  reference?: string;
  lineAmountType?: LineAmountType;
  lineItems: LineItemInput[];
}

/* ------------------------------------------------------------------ */
/* Accounting                                                          */
/* ------------------------------------------------------------------ */

export type AccountClass = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  /** Source-specific type, e.g. Xero "CURRLIAB" or BC "Posting". */
  type: string;
  /** Human label for the type, e.g. "Current Liability". */
  typeLabel: string;
  /** Undefined when the source leaves the account unclassified (never assumed to be an asset). */
  class?: AccountClass;
  taxType?: string;
  description?: string;
  status: 'active' | 'archived';
  isBank: boolean;
  balance?: number;
}

export interface AccountInput {
  code: string;
  name: string;
  type: string;
  taxType?: string;
  description?: string;
}

export interface JournalLine {
  accountCode: string;
  accountName?: string;
  description?: string;
  /** Positive = debit, negative = credit. */
  amount: number;
  taxType?: string;
}

export interface ManualJournal {
  id: string;
  date: IsoDate;
  narration: string;
  status: 'draft' | 'posted' | 'voided' | 'deleted';
  lines: JournalLine[];
  total: number;
  sourceUrl?: string;
}

export interface ManualJournalInput {
  date: IsoDate;
  narration: string;
  lines: JournalLine[];
  status?: 'draft' | 'posted';
}

/** A posted general-ledger line (Xero journal line / BC G/L entry). */
export interface LedgerEntry {
  id: string;
  date: IsoDate;
  accountCode: string;
  accountName?: string;
  description?: string;
  documentNumber?: string;
  sourceType?: string;
  debit: number;
  credit: number;
}

export interface TaxRate {
  id: string;
  name: string;
  taxType: string;
  /**
   * Percentage. Undefined when the source names the tax code but doesn't
   * expose its percentage (BC tax groups): never show such a code as 0%.
   */
  rate?: number;
  status: 'active' | 'archived';
}

export type FixedAssetStatus = 'draft' | 'registered' | 'disposed' | 'unknown';

export interface FixedAsset {
  id: string;
  number: string;
  name: string;
  /** `unknown` when the source doesn't say (BC's API has no asset status). */
  status: FixedAssetStatus;
  purchaseDate?: IsoDate;
  purchasePrice?: number;
  bookValue?: number;
  assetType?: string;
}

/* ------------------------------------------------------------------ */
/* Payroll and projects                                                */
/* ------------------------------------------------------------------ */

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  jobTitle?: string;
  startDate?: IsoDate;
  status: 'active' | 'terminated';
}

export interface PayRun {
  id: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  paymentDate: IsoDate;
  status: 'draft' | 'posted';
  employeeCount?: number;
  totalCost?: number;
  totalPay?: number;
  calendarName?: string;
}

export type ProjectStatus = 'in-progress' | 'closed' | 'unknown';

export interface Project {
  id: string;
  name: string;
  contact?: ContactRef;
  /** `unknown` when the source doesn't say (BC's projects API has no status). */
  status: ProjectStatus;
  deadline?: IsoDate;
  currency?: string;
  estimate?: number;
  totalInvoiced?: number;
  totalToInvoice?: number;
  totalExpenses?: number;
  minutesLogged?: number;
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export type ReportId =
  | 'profit-and-loss'
  | 'balance-sheet'
  | 'trial-balance'
  | 'aged-receivables'
  | 'aged-payables'
  | 'bank-summary'
  | 'executive-summary'
  | 'cash-flow';

export interface ReportParams {
  from?: IsoDate;
  to?: IsoDate;
  /** Point-in-time reports (balance sheet, trial balance, aged) use `date`. */
  date?: IsoDate;
  periods?: number;
  timeframe?: 'month' | 'quarter' | 'year';
}

export type ReportCell = string | number | null;

export interface ReportRow {
  kind: 'row' | 'summary';
  cells: ReportCell[];
  /** Optional account id/code for drill-down. */
  accountId?: string;
}

export interface ReportSection {
  title?: string;
  rows: ReportRow[];
}

export interface Report {
  id: ReportId;
  title: string;
  subtitles: string[];
  /** Column headings; the first column is the row label. */
  columns: string[];
  sections: ReportSection[];
  generatedAt: string;
  /** Shown above the report when the source can only partly answer it. */
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface DocumentBucket {
  count: number;
  /**
   * Total in the base currency. Undefined when a document's amount isn't
   * reported by the source (`unknownCount`), or when the bucket holds documents
   * in other currencies (`byCurrency`): Bookie never converts at a guessed rate.
   */
  total?: number;
  /** Per-currency totals, as the source reports them, when the bucket mixes currencies. */
  byCurrency?: { currency: string; total: number }[];
  /** Documents whose amount the source doesn't report (counted, never summed). */
  unknownCount?: number;
}

export interface DashboardSummary {
  /** Base currency; empty when the source doesn't say. */
  currency: string;
  bankAccounts: BankAccount[];
  receivables: {
    draft: DocumentBucket;
    awaitingApproval: DocumentBucket;
    awaitingPayment: DocumentBucket;
    overdue: DocumentBucket;
  };
  payables: {
    draft: DocumentBucket;
    awaitingApproval: DocumentBucket;
    awaitingPayment: DocumentBucket;
    overdue: DocumentBucket;
  };
  /** Income and expenses per month from the P&L, oldest first (`month` is `YYYY-MM`). */
  trend: { month: string; income: number; expenses: number }[];
  /** Profit and loss for the current financial year to date. */
  profitAndLoss?: { from: IsoDate; to: IsoDate; income: number; expenses: number; net: number };
  /**
   * Plain-English reasons a figure above is missing or partial, shown on the
   * dashboard and passed to Bookie (e.g. "Financial year isn't set up in Business Central").
   */
  notes?: {
    bank?: string;
    receivables?: string;
    payables?: string;
    trend?: string;
    profitAndLoss?: string;
  };
}

/** Documents and payments entered on one day (by document date), for the activity chart. */
export interface ActivityDay {
  date: IsoDate;
  /** Sales invoices. */
  sales: number;
  /** Purchase bills. */
  purchases: number;
  /** Payments received and made. */
  payments: number;
  quotes: number;
  /** Sales and purchase credit notes. */
  creditNotes: number;
}

/* ------------------------------------------------------------------ */
/* Attachments and the capture inbox                                   */
/* ------------------------------------------------------------------ */

/** Documents that can carry file attachments. */
export type AttachmentEntity =
  'invoice' | 'bill' | 'credit-note' | 'quote' | 'contact' | 'bank-transaction' | 'manual-journal';

export const ATTACHMENT_ENTITIES: readonly AttachmentEntity[] = [
  'invoice',
  'bill',
  'credit-note',
  'quote',
  'contact',
  'bank-transaction',
  'manual-journal',
];

export interface Attachment {
  id: string;
  fileName: string;
  /** MIME type as the source reports it (or, where the source sends none, from the file extension). */
  contentType?: string;
  /** Bytes; undefined when the source doesn't report a reliable size. */
  size?: number;
  updatedAt?: string;
}

/** The bytes of one attachment or inbox file. */
export interface AttachmentFile {
  bytes: ArrayBuffer;
  contentType: string;
  fileName: string;
}

export interface AttachmentUpload {
  fileName: string;
  contentType: string;
  bytes: ArrayBuffer;
}

/** A document waiting in the source system's capture inbox (Xero Files › Inbox). */
export interface InboxFile {
  id: string;
  fileName: string;
  contentType?: string;
  size?: number;
  receivedAt?: string;
}

export interface Inbox {
  files: InboxFile[];
  /** Address that forwards documents into the inbox, when the source has one. */
  email?: string;
  /** Shown when the list may be incomplete. */
  note?: string;
}
