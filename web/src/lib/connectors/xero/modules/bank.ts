import type {
  BankAccount,
  BankTransaction,
  BankTransactionInput,
  ListQuery,
  Page,
} from '@/lib/domain/types';
import { xeroDate, xeroString, type XeroClient } from '../client';
import {
  fromXeroLineItem,
  today,
  toLineAmountTypes,
  toXeroLineItem,
  type XeroLineItem,
} from '../mappers';
import { fromXeroReport, type XeroReport } from '../reports';
import type { BankModule } from '../../types';
import type { XeroAccount } from './accounts';
import { xeroTransfers } from './transfers';

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
  Account?: { AccountID: string; Code?: string };
  Invoice?: {
    InvoiceNumber?: string;
    CurrencyCode?: string;
    Contact?: { ContactID: string; Name?: string };
  };
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
  };
}

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
  };
}

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
    ...xeroTransfers(client),

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
    async transactions(bankAccountId: string, query?: ListQuery): Promise<Page<BankTransaction>> {
      const pageSize = query?.pageSize ?? 50;
      const page = Math.max(1, Math.min(query?.page ?? 1, Math.floor(MAX_MERGE / pageSize)));
      const depth = page * pageSize;
      const id = bankAccountId.replace(/[^0-9a-f-]/gi, '');
      const search = query?.search
        ? ` AND Reference!=null AND Reference.Contains("${xeroString(query.search)}")`
        : '';
      const range = [
        query?.from ? ` AND Date>=DateTime(${query.from.replaceAll('-', ',')})` : '',
        query?.to ? ` AND Date<=DateTime(${query.to.replaceAll('-', ',')})` : '',
      ].join('');
      const [transactions, payments] = await Promise.all([
        client.request<{ BankTransactions: XeroBankTransaction[]; pagination?: Pagination }>(
          'BankTransactions',
          {
            query: {
              where: `BankAccount.AccountID==guid("${id}") AND Status=="AUTHORISED"${range}${search}`,
              order: 'Date DESC',
              page: 1,
              pageSize: depth,
            },
          }
        ),
        client.request<{ Payments: XeroPayment[]; pagination?: Pagination }>('Payments', {
          query: {
            where: `Account.AccountID==guid("${id}") AND Status=="AUTHORISED"${range}${search}`,
            order: 'Date DESC',
            page: 1,
            pageSize: depth,
          },
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

    async createTransaction(input) {
      const result = await client.request<{ BankTransactions: XeroBankTransaction[] }>(
        'BankTransactions',
        { method: 'PUT', body: { BankTransactions: [toXeroBankTransaction(input)] } }
      );
      return fromXeroBankTransaction(result.BankTransactions[0]);
    },
  };
}
