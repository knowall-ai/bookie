import type {
  BankAccount,
  BankAccountInput,
  BankTransaction,
  BankTransactionInput,
  BankTransactionQuery,
  Page,
} from '@/lib/domain/types';
import { xeroDate, xeroString, xeroTimestamp, type XeroClient } from '../client';
import {
  fromLineAmountTypes,
  fromXeroLineItem,
  today,
  toLineAmountTypes,
  toXeroLineItem,
  type XeroLineItem,
} from '../mappers';
import { fromXeroReport, type XeroReport } from '../reports';
import { ConnectorError, type BankModule, type NewBankAccountRules } from '../../types';
import type { XeroAccount } from './accounts';
import { xeroTransfers } from './transfers';
import { XERO_FEED_NOTE, xeroBalanceHistory } from './bank-history';

/* Raw shapes */

export interface XeroBankTransaction {
  BankTransactionID: string;
  Type: string;
  Contact?: { ContactID: string; Name?: string };
  BankAccount: { AccountID: string; Code?: string; Name?: string };
  Date?: string;
  DateString?: string;
  Reference?: string;
  Total?: number;
  CurrencyCode?: string;
  IsReconciled?: boolean;
  Status: 'AUTHORISED' | 'DELETED' | 'VOIDED';
  LineItems?: XeroLineItem[];
  LineAmountTypes?: string;
  SubTotal?: number;
  TotalTax?: number;
  HasAttachments?: boolean;
  UpdatedDateUTC?: string;
}

export interface XeroPayment {
  PaymentID: string;
  PaymentType: string;
  Date?: string;
  Amount?: number;
  BankAmount?: number;
  Reference?: string;
  IsReconciled?: boolean;
  Status: 'AUTHORISED' | 'DELETED';
  Account?: { AccountID: string; Code?: string; Name?: string };
  /** Xero puts credit notes paid out or refunded here too, with a credit-note `Type`. */
  Invoice?: {
    InvoiceID?: string;
    InvoiceNumber?: string;
    Type?: string;
    CurrencyCode?: string;
    Contact?: { ContactID: string; Name?: string };
  };
  BatchPaymentID?: string;
  HasAccount?: boolean;
  UpdatedDateUTC?: string;
}

interface Pagination {
  itemCount?: number;
}

/* Mappers */

const BANK_TYPE: Record<string, BankAccount['type']> = {
  BANK: 'bank',
  CREDITCARD: 'credit-card',
  PAYPAL: 'paypal',
};

export function fromXeroBankAccount(raw: XeroAccount, baseCurrency?: string): BankAccount {
  return {
    id: raw.AccountID,
    name: raw.Name,
    code: raw.Code || undefined,
    accountNumber: raw.BankAccountNumber || undefined,
    currency: raw.CurrencyCode || baseCurrency || '',
    type: BANK_TYPE[raw.BankAccountType ?? ''] ?? 'bank',
  };
}

const XERO_BANK_TYPE: Record<NonNullable<BankAccountInput['type']>, string> = {
  bank: 'BANK',
  'credit-card': 'CREDITCARD',
  paypal: 'PAYPAL',
};

/**
 * PUT Accounts body for a new bank account. Xero needs `Type: BANK`, a name and
 * a bank account number; the code is optional for bank accounts, and the
 * currency must be one the organisation has enabled. Bookie always sends the
 * currency the person chose rather than letting Xero default it.
 */
export function toXeroBankAccount(input: BankAccountInput): Record<string, unknown> {
  return {
    Type: 'BANK',
    Name: input.name,
    Code: input.code || undefined,
    BankAccountNumber: input.accountNumber || undefined,
    BankAccountType: XERO_BANK_TYPE[input.type ?? 'bank'],
    CurrencyCode: input.currency,
  };
}

/** `xeroLink` opens the organisation in Xero (deep links go through organisationlogin). */
export function xeroNewBankAccount(xeroLink?: string): NewBankAccountRules {
  return {
    types: ['bank', 'credit-card', 'paypal'],
    accountNumberRequired: true,
    codeOptional: true,
    codeSharedWithChart: true,
    codeHint: 'Xero bank accounts can have no code.',
    // Xero: codes up to 10 characters, names up to 150.
    codeMaxLength: 10,
    nameMaxLength: 150,
    accountNumberMaxLength: 255,
    currencySetup: {
      text: 'To use another currency, add it in Xero under organisation settings, Currencies.',
      href: xeroLink,
      linkLabel: 'Open Xero',
    },
  };
}

/**
 * Opening and closing balance per account id from the Bank Summary report
 * (cells: account, opening, cash received, cash spent, closing), in base currency.
 */
export function bankSummaryBalances(
  report: XeroReport
): Map<string, { opening?: number; closing: number }> {
  const summary = fromXeroReport('bank-summary', report);
  const balances = new Map<string, { opening?: number; closing: number }>();
  // Read by header so a new column can't swap opening and closing. A header with
  // only the first label (as some responses have) keeps Xero's documented order.
  const column = (label: RegExp, position: number) => {
    const found = summary.columns.findIndex((c) => label.test(c));
    return found >= 0 ? found : summary.columns.length <= 1 ? position : -1;
  };
  const openingAt = column(/^opening balance$/i, 1);
  const closingAt = column(/^closing balance$/i, 4);
  for (const row of summary.sections.flatMap((s) => s.rows)) {
    const opening = openingAt >= 0 ? row.cells[openingAt] : undefined;
    const closing = closingAt >= 0 ? row.cells[closingAt] : undefined;
    if (row.kind === 'row' && row.accountId && typeof closing === 'number') {
      balances.set(row.accountId, {
        opening: typeof opening === 'number' ? opening : undefined,
        closing,
      });
    }
  }
  return balances;
}

/** Closing balance ("Balance in Xero") per account id from the Bank Summary report. */
export function closingBalances(report: XeroReport): Map<string, number> {
  return new Map([...bankSummaryBalances(report)].map(([id, b]) => [id, b.closing]));
}

function transactionType(type: string): BankTransaction['type'] {
  if (type === 'SPEND-TRANSFER') return 'transfer-out';
  if (type === 'RECEIVE-TRANSFER') return 'transfer-in';
  return type.startsWith('SPEND') ? 'spend' : 'receive';
}

export function fromXeroBankTransaction(raw: XeroBankTransaction): BankTransaction {
  const lines = raw.LineItems?.map(fromXeroLineItem);
  const lineText = lines
    ?.map((l) => l.description)
    .filter(Boolean)
    .join('; ');
  return {
    id: raw.BankTransactionID,
    bankAccountId: raw.BankAccount.AccountID,
    bankAccountName: raw.BankAccount.Name,
    date: xeroDate(raw.DateString ?? raw.Date) ?? '',
    type: transactionType(raw.Type),
    contact: raw.Contact?.ContactID
      ? { id: raw.Contact.ContactID, name: raw.Contact.Name ?? '' }
      : undefined,
    reference: raw.Reference || undefined,
    description:
      lineText ||
      raw.Contact?.Name ||
      (raw.Type.endsWith('TRANSFER') ? 'Bank transfer' : undefined),
    amount: raw.Total ?? 0,
    currency: raw.CurrencyCode,
    isReconciled: !!raw.IsReconciled,
    status: raw.Status === 'AUTHORISED' ? 'authorised' : 'deleted',
    lineItems: lines,
    source: 'bank-transaction',
    lineAmountType: fromLineAmountTypes(raw.LineAmountTypes),
    subTotal: raw.SubTotal,
    totalTax: raw.TotalTax,
    hasAttachments: raw.HasAttachments,
    updatedAt: xeroTimestamp(raw.UpdatedDateUTC),
  };
}

/** The document a payment settles, from the payment's `Invoice.Type`. */
const DOCUMENT_KIND: Record<string, NonNullable<BankTransaction['document']>['kind']> = {
  ACCREC: 'invoice',
  ACCPAY: 'bill',
  ACCRECCREDIT: 'credit-note',
  ACCPAYCREDIT: 'credit-note',
  APPREPAYMENT: 'prepayment',
  ARPREPAYMENT: 'prepayment',
  APOVERPAYMENT: 'overpayment',
  AROVERPAYMENT: 'overpayment',
};

/** Payments that money comes in on: customer payments and supplier refunds. */
export const RECEIVING_PAYMENTS = new Set([
  'ACCRECPAYMENT',
  'APCREDITPAYMENT',
  'APOVERPAYMENTPAYMENT',
  'APPREPAYMENTPAYMENT',
]);

/** Invoice and bill payments are separate from bank transactions in Xero, but sit in the same register. */
export function fromXeroPaymentAsTransaction(raw: XeroPayment): BankTransaction {
  const contact = raw.Invoice?.Contact;
  return {
    id: raw.PaymentID,
    bankAccountId: raw.Account?.AccountID ?? '',
    date: xeroDate(raw.Date) ?? '',
    type: RECEIVING_PAYMENTS.has(raw.PaymentType) ? 'receive' : 'spend',
    contact: contact?.ContactID ? { id: contact.ContactID, name: contact.Name ?? '' } : undefined,
    reference: raw.Reference || raw.Invoice?.InvoiceNumber || undefined,
    description: contact?.Name ? `Payment: ${contact.Name}` : 'Payment',
    amount: raw.BankAmount ?? raw.Amount ?? 0,
    currency: raw.Invoice?.CurrencyCode,
    isReconciled: !!raw.IsReconciled,
    status: raw.Status === 'AUTHORISED' ? 'authorised' : 'deleted',
    source: 'payment',
    document:
      raw.Invoice?.InvoiceID && raw.Invoice.Type && DOCUMENT_KIND[raw.Invoice.Type]
        ? {
            id: raw.Invoice.InvoiceID,
            number: raw.Invoice.InvoiceNumber || undefined,
            kind: DOCUMENT_KIND[raw.Invoice.Type],
          }
        : undefined,
    batchPaymentId: raw.BatchPaymentID || undefined,
    updatedAt: xeroTimestamp(raw.UpdatedDateUTC),
  };
}

/** Spend-side bank transaction types (money out of the account). */
const SPEND_TYPES = ['SPEND', 'SPEND-TRANSFER', 'SPEND-OVERPAYMENT', 'SPEND-PREPAYMENT'];
const RECEIVE_TYPES = ['RECEIVE', 'RECEIVE-TRANSFER', 'RECEIVE-OVERPAYMENT', 'RECEIVE-PREPAYMENT'];
/** Payment types that pay money out (the rest bring money in, see RECEIVING_PAYMENTS). */
const PAYING_PAYMENTS = [
  'ACCPAYPAYMENT',
  'ARCREDITPAYMENT',
  'AROVERPAYMENTPAYMENT',
  'ARPREPAYMENTPAYMENT',
];

const guid = (id: string) => id.replace(/[^0-9a-f-]/gi, '');
const anyOf = (field: string, values: string[]) =>
  `(${values.map((v) => `${field}=="${v}"`).join(' OR ')})`;

/**
 * `where` clauses for the two endpoints behind a register. Exported for tests.
 * Xero rejects operations on optional fields without a null guard, hence `Reference!=null`.
 */
export function registerFilters(bankAccountId: string, query?: BankTransactionQuery) {
  const id = guid(bankAccountId);
  const common: string[] = ['Status=="AUTHORISED"'];
  if (query?.from) common.push(`Date>=DateTime(${query.from.replaceAll('-', ',')})`);
  if (query?.to) common.push(`Date<=DateTime(${query.to.replaceAll('-', ',')})`);
  if (query?.reconciled !== undefined) common.push(`IsReconciled==${query.reconciled}`);
  if (query?.search) {
    common.push(`Reference!=null AND Reference.Contains("${xeroString(query.search)}")`);
  }
  const transactions = [`BankAccount.AccountID==guid("${id}")`, ...common];
  const payments = [`Account.AccountID==guid("${id}")`, ...common];
  if (query?.contactId) {
    transactions.push(`Contact.ContactID==guid("${guid(query.contactId)}")`);
    payments.push(`Invoice.Contact.ContactID==guid("${guid(query.contactId)}")`);
  }
  if (query?.direction === 'spent') {
    transactions.push(anyOf('Type', SPEND_TYPES));
    payments.push(anyOf('PaymentType', PAYING_PAYMENTS));
  } else if (query?.direction === 'received') {
    transactions.push(anyOf('Type', RECEIVE_TYPES));
    payments.push(anyOf('PaymentType', [...RECEIVING_PAYMENTS]));
  }
  return { transactions: transactions.join(' AND '), payments: payments.join(' AND ') };
}

/** Shown above every Xero register: what Xero's API doesn't expose. */
export const XERO_BANK_LIMITATIONS =
  "Xero's API doesn't share bank statement lines, so this is the account's transactions in Xero (spend and receive money, transfers and payments), not the bank feed. Reconcile in Xero. There's no running balance: Xero's Bank Statement report isn't available to this connection.";

export function toXeroBankTransaction(input: BankTransactionInput): Record<string, unknown> {
  return {
    Type: input.type === 'spend' ? 'SPEND' : 'RECEIVE',
    Contact: { ContactID: input.contactId },
    BankAccount: { AccountID: input.bankAccountId },
    Date: input.date,
    Reference: input.reference || undefined,
    LineAmountTypes: toLineAmountTypes(input.lineAmountType),
    LineItems: input.lineItems.map(toXeroLineItem),
    Status: 'AUTHORISED',
  };
}

/** Newest first; ties keep a stable order by id so pages never overlap. */
function byDateDesc(a: BankTransaction, b: BankTransaction) {
  return b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
}

/** Xero's largest page; also the deepest we merge two sources to. */
export const MAX_MERGE = 1000;

export function xeroBank(
  client: XeroClient,
  baseCurrency: () => Promise<string | undefined> = async () => undefined,
  xeroLink?: string
): BankModule {
  /** Count unreconciled items per bank account (spend/receive money and payments). */
  const unreconciled = async () => {
    const [transactions, payments] = await Promise.all([
      client.request<{ BankTransactions: XeroBankTransaction[] }>('BankTransactions', {
        query: {
          where: 'IsReconciled==false AND Status=="AUTHORISED"',
          page: 1,
          pageSize: MAX_MERGE,
        },
      }),
      client.request<{ Payments: XeroPayment[] }>('Payments', {
        query: {
          where: 'IsReconciled==false AND Status=="AUTHORISED"',
          page: 1,
          pageSize: MAX_MERGE,
        },
      }),
    ]);
    // A full page means there may be more: the counts would be short, so don't show them.
    if (
      transactions.BankTransactions.length >= MAX_MERGE ||
      payments.Payments.length >= MAX_MERGE
    ) {
      return undefined;
    }
    const counts = new Map<string, number>();
    const add = (id?: string) => id && counts.set(id, (counts.get(id) ?? 0) + 1);
    transactions.BankTransactions.forEach((t) => add(t.BankAccount.AccountID));
    payments.Payments.forEach((p) => add(p.Account?.AccountID));
    return counts;
  };

  return {
    ...xeroTransfers(client),

    async accounts() {
      const [accounts, summary, counts, base] = await Promise.all([
        client.request<{ Accounts: XeroAccount[] }>('Accounts', {
          query: { where: 'Type=="BANK" AND Status=="ACTIVE"', order: 'Name ASC' },
        }),
        client
          .request<{ Reports: XeroReport[] }>('Reports/BankSummary', {
            query: { fromDate: today(), toDate: today() },
          })
          .then((r) => closingBalances(r.Reports[0]))
          .catch(() => undefined),
        unreconciled().catch(() => undefined),
        baseCurrency().catch(() => undefined),
      ]);
      return accounts.Accounts.map((raw) => {
        const account = fromXeroBankAccount(raw, base);
        return {
          ...account,
          // Xero's API has no bank-feed statement balance, so statementBalance stays unknown.
          // Bank Summary (like the Balance Sheet) leaves out accounts with a zero balance,
          // so an active account missing from it is at zero.
          balance: summary ? (summary.get(raw.AccountID) ?? 0) : undefined,
          // Bank Summary amounts are in base currency, foreign-currency accounts included.
          balanceCurrency: base && account.currency !== base ? base : undefined,
          unreconciledCount: counts ? (counts.get(raw.AccountID) ?? 0) : undefined,
        };
      });
    },

    /**
     * Xero's account register mixes two endpoints: spend/receive/transfer money
     * (BankTransactions) and invoice/bill payments (Payments). To page the merged
     * list correctly we read the first `page * pageSize` of each, newest first,
     * merge, and slice; Xero allows up to 1,000 per call, so this goes 1,000 deep.
     */
    async transactions(
      bankAccountId: string,
      query?: BankTransactionQuery
    ): Promise<Page<BankTransaction>> {
      const pageSize = query?.pageSize ?? 50;
      const page = Math.max(1, Math.min(query?.page ?? 1, Math.floor(MAX_MERGE / pageSize)));
      const depth = page * pageSize;
      const where = registerFilters(bankAccountId, query);
      const [transactions, payments] = await Promise.all([
        client.request<{ BankTransactions: XeroBankTransaction[]; pagination?: Pagination }>(
          'BankTransactions',
          { query: { where: where.transactions, order: 'Date DESC', page: 1, pageSize: depth } }
        ),
        client.request<{ Payments: XeroPayment[]; pagination?: Pagination }>('Payments', {
          query: { where: where.payments, order: 'Date DESC', page: 1, pageSize: depth },
        }),
      ]);
      const merged = [
        ...transactions.BankTransactions.map(fromXeroBankTransaction),
        ...payments.Payments.map(fromXeroPaymentAsTransaction),
      ].sort(byDateDesc);
      const total =
        transactions.pagination?.itemCount !== undefined &&
        payments.pagination?.itemCount !== undefined
          ? transactions.pagination.itemCount + payments.pagination.itemCount
          : undefined;
      const items = merged.slice((page - 1) * pageSize, depth);
      const more = total !== undefined ? total > depth : merged.length > depth;
      return {
        items,
        page,
        pageSize,
        hasMore: more && depth + pageSize <= MAX_MERGE,
        total,
        note:
          more && depth + pageSize > MAX_MERGE
            ? 'Bookie shows the latest 1,000 transactions for this account. Open the account in Xero to see older ones.'
            : undefined,
      };
    },

    async transaction(id, source) {
      if (source === 'payment') {
        const result = await client.request<{ Payments: XeroPayment[] }>(
          `Payments/${encodeURIComponent(id)}`
        );
        return fromXeroPaymentAsTransaction(result.Payments[0]);
      }
      const result = await client.request<{ BankTransactions: XeroBankTransaction[] }>(
        `BankTransactions/${encodeURIComponent(id)}`
      );
      return fromXeroBankTransaction(result.BankTransactions[0]);
    },

    filters: { direction: true, reconciled: true, contact: true },
    limitations: XERO_BANK_LIMITATIONS,

    async createTransaction(input) {
      const result = await client.request<{ BankTransactions: XeroBankTransaction[] }>(
        'BankTransactions',
        { method: 'PUT', body: { BankTransactions: [toXeroBankTransaction(input)] } }
      );
      return fromXeroBankTransaction(result.BankTransactions[0]);
    },

    balanceHistory: () => xeroBalanceHistory(client, baseCurrency),
    feedNote: XERO_FEED_NOTE,

    newAccount: xeroNewBankAccount(xeroLink),
    async createAccount(input) {
      const result = await client.request<{ Accounts: XeroAccount[] }>('Accounts', {
        method: 'PUT',
        body: toXeroBankAccount(input),
      });
      const created = result.Accounts?.[0];
      if (!created) {
        throw new ConnectorError('Xero did not return the new bank account.', 502, 'xero');
      }
      // Xero echoes CurrencyCode; it is the one Bookie sent, never a default.
      return fromXeroBankAccount(created, input.currency);
    },
  };
}
