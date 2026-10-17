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
  BankAccount,
  BankTransaction,
  BankTransactionInput,
  BankTransactionQuery,
  Contact,
  ContactInput,
  CreditNote,
  CreditNoteType,
  DashboardSummary,
  Employee,
  FixedAsset,
  Invoice,
  InvoiceInput,
  InvoiceType,
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
  PurchaseOrder,
  PurchaseOrderInput,
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
}

export interface PurchaseOrdersModule {
  list(query?: ListQuery): Promise<Page<PurchaseOrder>>;
  get(id: string): Promise<PurchaseOrder>;
  create?(input: PurchaseOrderInput): Promise<PurchaseOrder>;
  update?(id: string, input: PurchaseOrderInput): Promise<PurchaseOrder>;
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
  list(
    query?: ListQuery & { status?: 'draft' | 'registered' | 'disposed' }
  ): Promise<Page<FixedAsset>>;
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
  list(query?: ListQuery & { status?: 'in-progress' | 'closed' }): Promise<Page<Project>>;
  get(id: string): Promise<Project>;
}

export interface AccountingConnector {
  readonly kind: OrgRef['kind'];
  readonly org: OrgRef;

  organisation(): Promise<OrgDetails>;
  dashboard(): Promise<DashboardSummary>;

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
  assets?: AssetsModule;
  reports?: ReportsModule;
  payroll?: PayrollModule;
  projects?: ProjectsModule;
  users?: UsersModule;

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
