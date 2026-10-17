import type {
  BankAccount,
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
import type { BankModule } from '../../types';
import type { XeroAccount } from './accounts';

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

/** Closing balance ("Balance in Xero") per account id from the Bank Summary report. */
export function closingBalances(report: XeroReport): Map<string, number> {
  const summary = fromXeroReport('bank-summary', report);
  const balances = new Map<string, number>();
  for (const row of summary.sections.flatMap((s) => s.rows)) {
    const closing = row.cells[4];
    if (row.kind === 'row' && row.accountId && typeof closing === 'number') {
      balances.set(row.accountId, closing);
    }
  }
  return balances;
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
const RECEIVING_PAYMENTS = new Set([
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
const MAX_MERGE = 1000;

export function xeroBank(client: XeroClient): BankModule {
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
    const counts = new Map<string, number>();
    const add = (id?: string) => id && counts.set(id, (counts.get(id) ?? 0) + 1);
    transactions.BankTransactions.forEach((t) => add(t.BankAccount.AccountID));
    payments.Payments.forEach((p) => add(p.Account?.AccountID));
    return counts;
  };

  return {
    async accounts() {
      const [accounts, summary, counts] = await Promise.all([
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
      ]);
      return accounts.Accounts.map((raw) => ({
        ...fromXeroBankAccount(raw),
        // Xero's API has no bank-feed statement balance, so statementBalance stays unknown.
        balance: summary ? (summary.get(raw.AccountID) ?? 0) : undefined,
        unreconciledCount: counts ? (counts.get(raw.AccountID) ?? 0) : undefined,
      }));
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
  };
}
