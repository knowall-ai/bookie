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
  /* Settings detail, shown on the org Settings page. Each is set only when the source provides it. */
  /** e.g. Xero "COMPANY", "SOLETRADER". */
  organisationType?: string;
  lineOfBusiness?: string;
  /** Xero plan class and edition, e.g. "STANDARD" / "BUSINESS". */
  plan?: string;
  edition?: string;
  phone?: string;
  /** Sales tax (VAT) accounting basis, e.g. Xero "ACCRUALS", "CASH", "FLATRATECASH". */
  salesTaxBasis?: string;
  /** e.g. "QUARTERLY1", "MONTHLY". */
  salesTaxPeriod?: string;
  paysTax?: boolean;
  /** "Inclusive" / "Exclusive" / "NoTax": the default line amount type for sales and purchases. */
  defaultSalesTax?: string;
  defaultPurchasesTax?: string;
  /** Lock dates: no changes allowed on or before. */
  periodLockDate?: IsoDate;
  endOfYearLockDate?: IsoDate;
  createdAt?: string;
  status?: string;
  isDemoCompany?: boolean;
  paymentTerms?: { sales?: PaymentTerm; bills?: PaymentTerm };
}

/** Xero payment terms: `day` with a rule such as "DAYSAFTERBILLDATE" or "OFFOLLOWINGMONTH". */
export interface PaymentTerm {
  day: number;
  type: string;
}

/** A person with access to the organisation (Xero Users). */
export interface OrgUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  /** Source role code, e.g. Xero "STANDARD", "READONLY", "FINANCIALADVISER". */
  role?: string;
  isSubscriber?: boolean;
  updatedAt?: string;
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
  brandingThemeId?: string;
  updatedAt?: string;
  sourceUrl?: string;
}

export interface InvoiceInput {
  brandingThemeId?: string;
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
  /** Credit not yet allocated or refunded. Undefined when the source doesn't report it (BC posted memos). */
  remainingCredit?: number;
  lineAmountType?: LineAmountType;
  lineItems?: LineItem[];
  /** Allocations to invoices or bills, oldest first. Only populated by `get`, when the source has them. */
  allocations?: CreditAllocation[];
  /** The invoice this credit note was raised against, when the source records one (BC "Applies-to"). */
  appliesTo?: { id?: string; number: string };
  updatedAt?: string;
  sourceUrl?: string;
}

export interface CreditNoteInput {
  type: CreditNoteType;
  contactId: string;
  date: IsoDate;
  number?: string;
  reference?: string;
  currency?: string;
  lineAmountType?: LineAmountType;
  lineItems: LineItemInput[];
  /** Create as draft (default) or approve straight away (Xero AUTHORISED / BC post). */
  status?: 'draft' | 'authorised';
}

/** Part of a credit note applied to an invoice or bill. */
export interface CreditAllocation {
  id?: string;
  date?: IsoDate;
  amount: number;
  invoice: { id: string; number?: string };
}

export interface AllocationInput {
  invoiceId: string;
  amount: number;
  date: IsoDate;
}

/* ------------------------------------------------------------------ */
/* History and notes                                                   */
/* ------------------------------------------------------------------ */

/** Documents and records that carry a history (Xero "History and notes"). */
export type HistoryEntity = 'invoice' | 'quote' | 'credit-note' | 'contact';

export interface HistoryRecord {
  /** ISO timestamp. */
  date: string;
  /** What happened, as the source words it: "Approved", "Note", "Invoice Sent"... */
  change: string;
  user?: string;
  details?: string;
}

export interface HistoryResult {
  /** Newest first. */
  records: HistoryRecord[];
  /** False when the source only exposes part of the history (BC: last modified only). */
  complete: boolean;
  note?: string;
}

export interface BrandingTheme {
  id: string;
  name: string;
  sortOrder?: number;
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

/** Status moves a purchase order can make (Xero: submit, approve, mark as billed, delete). */
export type PurchaseOrderStatusChange = 'submitted' | 'authorised' | 'billed' | 'deleted';

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
  /**
   * Date of the latest statement line the bank feed brought in, exactly as the
   * source reports it. Undefined when the source can't say (Xero's API, BC):
   * never the time Bookie read the books.
   */
  feedDate?: IsoDate;
  unreconciledCount?: number;
  type?: 'bank' | 'credit-card' | 'paypal' | 'other';
}

/** A bank account's closing balance at the end of `date`. */
export interface BalancePoint {
  date: IsoDate;
  balance: number;
}

/** One account's balance over recent days or weeks, from the source's own figures. */
export interface BalanceHistory {
  /** Oldest first. Only dates the source gave a balance for: nothing is interpolated. */
  points: BalancePoint[];
  /** Currency of the balances (Xero gives foreign-currency accounts' balances in base currency). */
  currency: string;
  /** Daily closing balances, or weekly ones where the source only gives those. */
  interval: 'day' | 'week';
}

/** Balance histories for all of an organisation's bank accounts, read in one go. */
export interface BankBalanceHistories {
  /** When Bookie read these from the source (ISO timestamp), so a cached read says so. */
  readAt: string;
  /** By bank account id. An account that's missing has no history Bookie can show. */
  accounts: Record<string, BalanceHistory>;
  /** Why some or all accounts have no history, shown instead of a chart. */
  note?: string;
}

/** A new bank account, as on Xero's "Add bank account". */
export interface BankAccountInput {
  name: string;
  /** Account code (Xero) or number (BC "No."); the source assigns one when blank and it can. */
  code?: string;
  accountNumber?: string;
  iban?: string;
  /** One of the organisation's own currencies: never defaulted. */
  currency: string;
  type?: 'bank' | 'credit-card' | 'paypal';
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
  /**
   * Which register entry this is. Xero keeps spend/receive/transfer money
   * (`bank-transaction`) apart from invoice and bill payments (`payment`).
   */
  source?: 'bank-transaction' | 'payment';
  lineAmountType?: LineAmountType;
  subTotal?: number;
  totalTax?: number;
  hasAttachments?: boolean;
  /** For payments: the document that was paid. */
  document?: {
    id: string;
    number?: string;
    kind: 'invoice' | 'bill' | 'credit-note' | 'prepayment' | 'overpayment';
  };
  /** Set when the payment was made as part of a batch payment. */
  batchPaymentId?: string;
  updatedAt?: string;
}

/**
 * One unreconciled line from the bank statement (the bank feed), as the bank
 * reported it. `amount` is positive; `direction` says which way the money went.
 * Only sources whose API shares statement lines provide these.
 */
export interface BankStatementLine {
  id: string;
  bankAccountId: string;
  date: IsoDate;
  direction: 'in' | 'out';
  amount: number;
  /** The bank account's currency, when the source says. */
  currency?: string;
  reference?: string;
  description?: string;
  /** Who the bank says paid or was paid, when it says. */
  payee?: string;
}

/** Filters for an account register ("Account transactions"). */
export interface BankTransactionQuery extends ListQuery {
  direction?: 'spent' | 'received';
  reconciled?: boolean;
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

/** Money moved between two of the organisation's own bank accounts (Xero BankTransfers). */
export interface BankTransfer {
  id: string;
  date: IsoDate;
  from: { id: string; name?: string };
  to: { id: string; name?: string };
  amount: number;
  /** The from-account's currency, when the source says what it is. */
  currency?: string;
  reference?: string;
  fromIsReconciled?: boolean;
  toIsReconciled?: boolean;
  status: 'authorised' | 'deleted';
}

export interface BankTransferInput {
  fromBankAccountId: string;
  toBankAccountId: string;
  date: IsoDate;
  amount: number;
  reference?: string;
}

/** Several invoice or bill payments made as one bank transaction (Xero BatchPayments). */
export interface BatchPayment {
  id: string;
  date: IsoDate;
  /** `purchase` = bills paid (Xero PAYBATCH); `sales` = invoices received (RECBATCH). */
  type: InvoiceType;
  bankAccountId?: string;
  bankAccountName?: string;
  currency?: string;
  reference?: string;
  total: number;
  payments: { id: string; invoiceId?: string; amount: number }[];
  isReconciled?: boolean;
  status: 'authorised' | 'deleted';
}

export interface BatchPaymentInput {
  bankAccountId: string;
  date: IsoDate;
  reference?: string;
  payments: { invoiceId: string; amount: number }[];
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
  lineAmountType?: LineAmountType;
  /** Xero: whether the journal shows on cash-basis reports. */
  showOnCashBasisReports?: boolean;
  hasAttachments?: boolean;
  updatedAt?: string;
}

/** Status changes on an existing manual journal (Xero: post a draft, delete a draft, void a posted one). */
export type JournalStatusChange = 'posted' | 'deleted' | 'voided';

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
  | 'cash-flow'
  | 'account-transactions'
  | 'journal-report';

export interface ReportParams {
  from?: IsoDate;
  to?: IsoDate;
  /** Point-in-time reports (balance sheet, trial balance, aged) use `date`. */
  date?: IsoDate;
  periods?: number;
  timeframe?: 'month' | 'quarter' | 'year';
  /** Account transactions: limit to one account code (all accounts when unset). */
  accountCode?: string;
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
  /** Indexes of text columns (left-aligned); other columns after the first are numbers. */
  textColumns?: number[];
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
