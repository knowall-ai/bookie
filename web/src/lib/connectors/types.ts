/**
 * The connector contract.
 *
 * A connector adapts one accounting back end (Xero, Business Central, ...) to
 * Bookie's domain model. It is built per request, for one organisation, with
 * credentials that belong to the signed-in user's tenant. Connectors never
 * persist accounting data.
 *
 * Every module is optional. Inside a module, read methods are required and
 * write methods are optional. The UI and the Bookie agent check for presence
 * (`connector.quotes?.create`) instead of hard-coding what each back end
 * supports, so adding a connector never means touching the screens.
 */
import type {
  Account,
  AccountInput,
  ActivityDay,
  Attachment,
  AttachmentEntity,
  AttachmentFile,
  AttachmentUpload,
  Inbox,
  BankAccount,
  BankAccountInput,
  BankBalanceHistories,
  BankStatementLine,
  BankTransaction,
  BankTransactionInput,
  BankTransactionQuery,
  AllocationInput,
  BrandingTheme,
  BankTransfer,
  BankTransferInput,
  BatchPayment,
  BatchPaymentInput,
  Contact,
  ContactInput,
  CreditNote,
  CreditNoteInput,
  CreditNoteType,
  Currency,
  DashboardSummary,
  Employee,
  FixedAsset,
  FixedAssetStatus,
  HistoryEntity,
  HistoryResult,
  Invoice,
  InvoiceInput,
  InvoiceType,
  IsoDate,
  Item,
  ItemInput,
  JournalStatusChange,
  LedgerEntry,
  ListQuery,
  ManualJournal,
  ManualJournalInput,
  OrgDetails,
  OrgRef,
  OrgUser,
  Page,
  PayRun,
  Payment,
  PaymentInput,
  Project,
  ProjectStatus,
  PurchaseOrder,
  PurchaseOrderInput,
  PurchaseOrderStatus,
  PurchaseOrderStatusChange,
  Quote,
  QuoteInput,
  QuoteStatus,
  Report,
  ReportId,
  ReportParams,
  TaxRate,
} from '@/lib/domain/types';

export interface InvoicesModule {
  list(type: InvoiceType, query?: ListQuery): Promise<Page<Invoice>>;
  get(id: string): Promise<Invoice>;
  create?(input: InvoiceInput): Promise<Invoice>;
  update?(id: string, input: InvoiceInput): Promise<Invoice>;
  /** Move to authorised (awaiting payment). */
  approve?(id: string): Promise<Invoice>;
  void?(id: string): Promise<Invoice>;
  /** Delete a draft. */
  delete?(id: string): Promise<void>;
  /** Email the invoice to the contact using the source system's template. */
  email?(id: string): Promise<void>;
  /** PDF bytes of the document as the source system renders it. */
  pdf?(id: string): Promise<ArrayBuffer>;
  /** The customer-facing online invoice URL (Xero "Online invoice"). Sales invoices only. */
  onlineUrl?(id: string): Promise<string | undefined>;
  /** Flag an approved sales invoice as sent without emailing it. */
  markAsSent?(id: string): Promise<Invoice>;
  /** Invoice templates the source offers (Xero branding themes). */
  brandingThemes?(): Promise<BrandingTheme[]>;
}

export interface QuotesModule {
  list(query?: ListQuery): Promise<Page<Quote>>;
  get(id: string): Promise<Quote>;
  create?(input: QuoteInput): Promise<Quote>;
  update?(id: string, input: QuoteInput): Promise<Quote>;
  setStatus?(id: string, status: QuoteStatusChange): Promise<Quote>;
  /** The status changes `setStatus` supports here (Business Central, for one, has no "declined"). */
  readonly statusChanges?: QuoteStatusChange[];
  /** Turn the quote into a draft sales invoice. Resolves to the new invoice's id when known. */
  convertToInvoice?(id: string): Promise<{ invoiceId?: string }>;
  /** Quote statuses from which `convertToInvoice` works. */
  readonly convertibleStatuses?: QuoteStatus[];
  pdf?(id: string): Promise<ArrayBuffer>;
}

export type QuoteStatusChange = 'sent' | 'accepted' | 'declined' | 'deleted';

export interface CreditNotesModule {
  list(type: CreditNoteType, query?: ListQuery): Promise<Page<CreditNote>>;
  get(id: string): Promise<CreditNote>;
  create?(input: CreditNoteInput): Promise<CreditNote>;
  /** Drafts only. */
  update?(id: string, input: CreditNoteInput): Promise<CreditNote>;
  /** Xero: AUTHORISED. Business Central: post the credit memo. */
  approve?(id: string): Promise<CreditNote>;
  void?(id: string): Promise<CreditNote>;
  /** Delete a draft. */
  delete?(id: string): Promise<void>;
  /** Apply part or all of the remaining credit to an outstanding invoice or bill for the same contact. */
  allocate?(id: string, input: AllocationInput): Promise<CreditNote>;
  /** Why `allocate` is missing, shown on approved credit notes (e.g. Business Central). */
  readonly allocationNote?: string;
}

export interface HistoryModule {
  /** The document's audit trail, newest first. */
  list(entity: HistoryEntity, id: string): Promise<HistoryResult>;
  /** Add a note to the history (Xero "Add note"). */
  addNote?(entity: HistoryEntity, id: string, note: string): Promise<void>;
}

export interface PurchaseOrdersModule {
  list(query?: ListQuery): Promise<Page<PurchaseOrder>>;
  get(id: string): Promise<PurchaseOrder>;
  create?(input: PurchaseOrderInput): Promise<PurchaseOrder>;
  update?(id: string, input: PurchaseOrderInput): Promise<PurchaseOrder>;
  /** Move the order on (submit, approve, mark as billed) or delete it. */
  setStatus?(id: string, status: PurchaseOrderStatusChange): Promise<PurchaseOrder>;
  /** The status changes `setStatus` supports here. */
  readonly statusChanges?: PurchaseOrderStatusChange[];
  /** Statuses from which an order can be deleted, when narrower than "anything not billed". */
  readonly deletableStatuses?: PurchaseOrderStatus[];
}

export interface ContactsModule {
  list(
    query?: ListQuery & { role?: 'customer' | 'supplier'; includeArchived?: boolean }
  ): Promise<Page<Contact>>;
  get(id: string): Promise<Contact>;
  create?(input: ContactInput): Promise<Contact>;
  update?(id: string, input: ContactInput): Promise<Contact>;
  archive?(id: string): Promise<Contact>;
}

export interface ItemsModule {
  list(query?: ListQuery): Promise<Page<Item>>;
  get(id: string): Promise<Item>;
  create?(input: ItemInput): Promise<Item>;
  update?(id: string, input: ItemInput): Promise<Item>;
  /** False when items post through posting groups, not per-item accounts (Business Central). */
  readonly perItemAccounts?: boolean;
}

export interface PaymentsModule {
  list(query?: ListQuery & { invoiceType?: InvoiceType }): Promise<Page<Payment>>;
  create?(input: PaymentInput): Promise<Payment>;
  /** Document types `create` can pay; every type when absent (BC: invoices only). */
  createFor?: InvoiceType[];
  /** Batch payments (several bills or invoices paid in one bank transaction). */
  batches?(query?: ListQuery): Promise<Page<BatchPayment>>;
  /** Pay several approved bills (or invoices) at once. */
  createBatch?(input: BatchPaymentInput): Promise<BatchPayment>;
}

export interface BankModule {
  accounts(): Promise<BankAccount[]>;
  transactions(bankAccountId: string, query?: BankTransactionQuery): Promise<Page<BankTransaction>>;
  /** One register entry with its line coding. `source` says which kind of entry the id is. */
  transaction?(id: string, source?: BankTransaction['source']): Promise<BankTransaction>;
  createTransaction?(input: BankTransactionInput): Promise<BankTransaction>;
  /** Which register filters the source supports. */
  readonly filters?: { direction?: boolean; reconciled?: boolean; contact?: boolean };
  /** What the source's API can't show here (e.g. bank statement lines), shown above the register. */
  readonly limitations?: string;
  /** Transfers between the organisation's own bank accounts, newest first. */
  transfers?(query?: ListQuery): Promise<Page<BankTransfer>>;
  createTransfer?(input: BankTransferInput): Promise<BankTransfer>;
  /** Add a bank account to the books ("Add bank account"). Needs `newAccount`. */
  createAccount?(input: BankAccountInput): Promise<BankAccount>;
  /** What `createAccount` accepts in this source. */
  readonly newAccount?: NewBankAccountRules;
  /**
   * Closing balances over the last few weeks for every bank account, built only
   * from figures the source gives. Absent when the source has no reliable history.
   */
  balanceHistory?(): Promise<BankBalanceHistories>;
  /** Why `BankAccount.feedDate` is never set for this source, shown as "Feed status not available". */
  readonly feedNote?: string;
  /** Unreconciled bank statement lines (the bank feed), when the source's API shares them. */
  statementLines?(bankAccountId: string): Promise<BankStatementLine[]>;
  /** How reconciling is finished in the source, for the Reconcile tab. */
  readonly reconcile?: ReconcileGuide;
}

/** A sentence about the source system, with an optional deep link into it. */
export interface SourceHint {
  text: string;
  href?: string;
  linkLabel?: string;
}

/** Per-source rules for a new bank account, so the form asks only what the source takes. */
export interface NewBankAccountRules {
  /** Account kinds the source can record (BC bank accounts have no kind). */
  types: NonNullable<BankAccountInput['type']>[];
  /** Xero needs a bank account number on a BANK account. */
  accountNumberRequired?: boolean;
  /** Whether the source has an IBAN field. */
  iban?: boolean;
  /** Longest code and name the source accepts. */
  codeMaxLength: number;
  nameMaxLength: number;
  accountNumberMaxLength: number;
  /** Whether the code can be left blank. */
  codeOptional: boolean;
  /** True when bank account codes share the chart of accounts' codes (Xero), so they must not clash. */
  codeSharedWithChart?: boolean;
  /** What happens to a blank code in this source, shown under the field. */
  codeHint?: string;
  /** Where to add a currency the books don't have yet, shown under the currency picker. */
  currencySetup: SourceHint;
  /** Something the source's API can't set on a new account, said plainly on the form. */
  note?: SourceHint;
}

/** What the source lets Bookie do towards reconciling, in the source's own words. */
export interface ReconcileGuide {
  /** Why statement lines aren't listed, when `statementLines` is absent. */
  statementLinesNote?: string;
  /** What happens in the source after Bookie records a payment, and what is still to do there. */
  afterPayment: string;
  /** The source's reconcile screen for one bank account. */
  url?(account: BankAccount): string | undefined;
}

export interface AccountsModule {
  /** `withBalances` adds each account's year-to-date balance (one extra report call). */
  list(options?: { withBalances?: boolean }): Promise<Account[]>;
  create?(input: AccountInput): Promise<Account>;
  /** Posted ledger lines, optionally for one account code. */
  ledger?(query?: ListQuery & { accountCode?: string }): Promise<Page<LedgerEntry>>;
}

export interface JournalsModule {
  list(query?: ListQuery): Promise<Page<ManualJournal>>;
  get(id: string): Promise<ManualJournal>;
  create?(input: ManualJournalInput): Promise<ManualJournal>;
  /** Post or delete a draft, or void a posted journal. */
  setStatus?(id: string, change: JournalStatusChange): Promise<ManualJournal>;
  /** Status tabs the source can list, besides "All". */
  readonly statuses?: ManualJournal['status'][];
}

export interface UsersModule {
  /** People with access to the organisation, read-only. */
  list(): Promise<OrgUser[]>;
}

export interface TaxRatesModule {
  list(): Promise<TaxRate[]>;
}

export interface AssetsModule {
  /**
   * Statuses this source can tell apart, in tab order. Omitted = Xero's
   * draft / registered / disposed. BC has no asset status: `['unknown']`.
   */
  statuses?: FixedAssetStatus[];
  list(query?: ListQuery & { status?: FixedAssetStatus }): Promise<Page<FixedAsset>>;
}

export interface CurrenciesModule {
  /** The currencies the organisation has enabled, base currency included. */
  list(): Promise<Currency[]>;
  /** True when documents and payments accept an exchange rate on write (Xero `CurrencyRate`). */
  readonly acceptsRate?: boolean;
}

export interface ReportsModule {
  /** Report ids this connector can run, in the order the Reporting tab lists them. */
  available: ReportId[];
  run(id: ReportId, params?: ReportParams): Promise<Report>;
}

export interface PayrollModule {
  employees(query?: ListQuery): Promise<Page<Employee>>;
  payRuns(query?: ListQuery): Promise<Page<PayRun>>;
}

export interface ProjectsModule {
  /**
   * Statuses this source can tell apart, in tab order. Omitted = in progress /
   * closed. BC's projects API has no status: `['unknown']`.
   */
  statuses?: ProjectStatus[];
  list(query?: ListQuery & { status?: ProjectStatus }): Promise<Page<Project>>;
  get(id: string): Promise<Project>;
}

export interface AttachmentsModule {
  /** Entities this back end can attach files to (others show "not available"). */
  readonly entities: readonly AttachmentEntity[];
  list(entity: AttachmentEntity, id: string): Promise<Attachment[]>;
  download(entity: AttachmentEntity, id: string, attachmentId: string): Promise<AttachmentFile>;
  upload?(entity: AttachmentEntity, id: string, file: AttachmentUpload): Promise<Attachment>;
  /** Source limits, enforced before upload. */
  readonly maxUploadBytes?: number;
  readonly maxFilesPerDocument?: number;
}

/**
 * Documents captured for bookkeeping: the source system's inbox of files
 * waiting to become bills, and the draft bills the Bookie agent has captured.
 */
export interface CaptureModule {
  inbox(): Promise<Inbox>;
  inboxFile(fileId: string): Promise<AttachmentFile>;
  /** Attach an inbox file to a bill (it then appears in the bill's attachments). */
  attachToBill?(fileId: string, billId: string): Promise<void>;
  /** Draft bills drafted by the Bookie agent ("Captured by Bookie"). */
  capturedBills(query?: ListQuery): Promise<Page<Invoice>>;
}

/**
 * A bank account that holds a Bitcoin wallet's public descriptor in the source
 * system. The descriptor never leaves the server: the UI only gets a summary.
 */
export interface SourceBitcoinWallet {
  bankAccountId: string;
  bankAccountNumber: string;
  name: string;
  /** The bank account's currency code ('' when the source leaves it blank, i.e. LCY). */
  currencyCode: string;
  /** xpub/ypub/zpub or an output descriptor, as typed into the source. */
  descriptor: string;
  /** Script type for a bare xpub; undefined = from the key prefix or the descriptor. */
  scriptType?: 'pkh' | 'wpkh' | 'sh-wpkh' | 'tr' | 'wsh-multi';
}

export type SourceBitcoinWallets =
  | { status: 'ok'; wallets: SourceBitcoinWallet[] }
  /** The extension that holds wallets isn't installed (or the user lacks its permission set). */
  | { status: 'unavailable'; reason: string };

/** A posted bank ledger entry on a BTC bank account, in satoshis. */
export interface BtcLedgerEntry {
  id: string;
  entryNumber?: number;
  postingDate: IsoDate;
  documentNumber?: string;
  externalDocumentNumber?: string;
  description?: string;
  /** Positive = money in. Exact: the source's BTC amount × 10^8. */
  amountSats: number;
  /** Not yet applied in a bank reconciliation in the source. */
  open?: boolean;
}

export type BtcLedger =
  { status: 'ok'; entries: BtcLedgerEntry[] } | { status: 'unavailable'; reason: string };

/** One general-journal line Bookie drafts for an on-chain transaction. */
export interface BtcJournalLine {
  /** The BTC bank account; the line's amount is in its currency. */
  bankAccountNumber: string;
  postingDate: IsoDate;
  documentNumber: string;
  /** The txid's first 35 characters (BC's External Document No. holds 35). */
  externalDocumentNumber: string;
  description: string;
  /** Positive = money in, in satoshis. */
  amountSats: number;
  /** The G/L account on the other side. */
  balancingAccountNumber: string;
}

/** A journal batch of Bookie's BTC lines, drafted and not yet posted. */
export interface BtcJournalDraft {
  batchId: string;
  batchCode: string;
  lines: BtcJournalLine[];
}

export interface BitcoinWalletsModule {
  wallets(): Promise<SourceBitcoinWallets>;
  /** Posted bank ledger entries of one BTC bank account. */
  ledger?(bankAccountNumber: string): Promise<BtcLedger>;
  /** Bookie's unposted BTC journal batches for a bank account. */
  drafts?(bankAccountNumber: string): Promise<BtcJournalDraft[]>;
  /** Create a new journal batch holding these lines (not posted). */
  draftJournal?(lines: BtcJournalLine[]): Promise<BtcJournalDraft>;
  /** Post one of Bookie's drafted batches for this bank account (after confirmation). */
  postJournal?(bankAccountNumber: string, batchId: string): Promise<void>;
}

/** The text the Bookie agent puts on bills it drafts from captured documents. */
export const CAPTURED_BY_BOOKIE = 'Captured by Bookie';

export interface AccountingConnector {
  readonly kind: OrgRef['kind'];
  readonly org: OrgRef;

  organisation(): Promise<OrgDetails>;
  dashboard(): Promise<DashboardSummary>;
  /** Documents and payments per day from `from` to `to` (inclusive), one entry per day. */
  activity?(from: IsoDate, to: IsoDate): Promise<ActivityDay[]>;

  invoices?: InvoicesModule;
  quotes?: QuotesModule;
  creditNotes?: CreditNotesModule;
  purchaseOrders?: PurchaseOrdersModule;
  contacts?: ContactsModule;
  items?: ItemsModule;
  payments?: PaymentsModule;
  bank?: BankModule;
  accounts?: AccountsModule;
  journals?: JournalsModule;
  taxRates?: TaxRatesModule;
  currencies?: CurrenciesModule;
  assets?: AssetsModule;
  reports?: ReportsModule;
  payroll?: PayrollModule;
  projects?: ProjectsModule;
  attachments?: AttachmentsModule;
  capture?: CaptureModule;
  users?: UsersModule;
  history?: HistoryModule;
  /** Bitcoin wallets kept in the source system itself (BC: the Bookie BC extension). */
  bitcoin?: BitcoinWalletsModule;

  /** Deep link to a document in the source system, for "Open in Xero/BC". */
  sourceLink?(entity: 'invoice' | 'bill' | 'quote' | 'contact', id: string): string | undefined;
}

/** Thrown when the source rejects a call. `status` mirrors the HTTP status. */
export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly source: OrgRef['kind'],
    readonly detail?: unknown
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export function isConnectorError(error: unknown): error is ConnectorError {
  return error instanceof ConnectorError;
}
