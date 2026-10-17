import type { BatchPayment, BatchPaymentInput, ListQuery, Page } from '@/lib/domain/types';
import type { PaymentsModule } from '../../types';
import { ConnectorError } from '../../types';
import { xeroDate, type XeroClient } from '../client';
import type { XeroAccount } from './accounts';

/* Raw shape, as GET BatchPayments returns it. */
export interface XeroBatchPayment {
  BatchPaymentID: string;
  Account?: { AccountID: string; CurrencyCode?: string };
  Date?: string;
  DateString?: string;
  Type?: 'PAYBATCH' | 'RECBATCH';
  Status?: 'AUTHORISED' | 'DELETED';
  TotalAmount?: number;
  IsReconciled?: boolean;
  /** NZ orgs. */
  Reference?: string;
  /** Non-NZ orgs: sent to the bank (max 18). */
  Details?: string;
  /** UK orgs: statement line only. */
  Narrative?: string;
  Payments?: { PaymentID: string; Amount?: number; Invoice?: { InvoiceID?: string } }[];
}

/** Xero limits the non-NZ "Details" field to 18 characters. */
export const XERO_BATCH_DETAILS_MAX = 18;

export function fromXeroBatchPayment(
  raw: XeroBatchPayment,
  bankNames?: Map<string, string>
): BatchPayment {
  const accountId = raw.Account?.AccountID;
  return {
    id: raw.BatchPaymentID,
    date: xeroDate(raw.DateString ?? raw.Date) ?? '',
    type: raw.Type === 'RECBATCH' ? 'sales' : 'purchase',
    bankAccountId: accountId,
    bankAccountName: accountId ? bankNames?.get(accountId) : undefined,
    currency: raw.Account?.CurrencyCode || undefined,
    reference: raw.Reference || raw.Details || raw.Narrative || undefined,
    total: raw.TotalAmount ?? 0,
    payments: (raw.Payments ?? []).map((p) => ({
      id: p.PaymentID,
      invoiceId: p.Invoice?.InvoiceID,
      amount: p.Amount ?? 0,
    })),
    isReconciled: raw.IsReconciled,
    status: raw.Status === 'DELETED' ? 'deleted' : 'authorised',
  };
}

/**
 * Xero files the batch reference under `Reference` in New Zealand and under
 * `Details` (sent to the bank, 18 characters) everywhere else.
 */
export function toXeroBatchPayment(
  input: BatchPaymentInput,
  country?: string
): Record<string, unknown> {
  const reference = input.reference?.trim() || undefined;
  const nz = country?.toUpperCase() === 'NZ';
  if (reference && !nz && reference.length > XERO_BATCH_DETAILS_MAX) {
    throw new ConnectorError(
      `Xero allows up to ${XERO_BATCH_DETAILS_MAX} characters for a batch payment reference.`,
      400,
      'xero'
    );
  }
  return {
    Account: { AccountID: input.bankAccountId },
    Date: input.date,
    ...(reference ? (nz ? { Reference: reference } : { Details: reference }) : {}),
    Payments: input.payments.map((p) => ({
      Invoice: { InvoiceID: p.invoiceId },
      Amount: p.amount,
    })),
  };
}

const DEFAULT_PAGE_SIZE = 50;

async function bankAccountNames(client: XeroClient): Promise<Map<string, string>> {
  const result = await client.request<{ Accounts: XeroAccount[] }>('Accounts', {
    query: { where: 'Type=="BANK"' },
  });
  return new Map(result.Accounts.map((a) => [a.AccountID, a.Name]));
}

/** Batch payments. GET BatchPayments has no paging, so Bookie pages the list itself. */
export function xeroBatchPayments(
  client: XeroClient
): Pick<PaymentsModule, 'batches' | 'createBatch'> {
  return {
    async batches(query?: ListQuery): Promise<Page<BatchPayment>> {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const where: string[] = [];
      if (query?.from) where.push(`Date>=DateTime(${query.from.replaceAll('-', ',')})`);
      if (query?.to) where.push(`Date<=DateTime(${query.to.replaceAll('-', ',')})`);
      const [result, names] = await Promise.all([
        client.request<{ BatchPayments: XeroBatchPayment[] }>('BatchPayments', {
          query: { where: where.join(' AND ') || undefined, order: 'Date DESC' },
        }),
        bankAccountNames(client).catch(() => undefined),
      ]);
      const needle = query?.search?.trim().toLowerCase();
      const all = (result.BatchPayments ?? [])
        .map((b) => fromXeroBatchPayment(b, names))
        .filter((b) => b.status === 'authorised')
        .filter(
          (b) =>
            !needle ||
            [b.reference, b.bankAccountName].some((v) => v?.toLowerCase().includes(needle))
        );
      return {
        items: all.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        hasMore: all.length > page * pageSize,
        total: all.length,
      };
    },

    async createBatch(input) {
      const org = await client.request<{ Organisations: { CountryCode?: string }[] }>(
        'Organisation'
      );
      const result = await client.request<{ BatchPayments: XeroBatchPayment[] }>('BatchPayments', {
        method: 'PUT',
        body: { BatchPayments: [toXeroBatchPayment(input, org.Organisations[0]?.CountryCode)] },
      });
      const names = await bankAccountNames(client).catch(() => undefined);
      return fromXeroBatchPayment(result.BatchPayments[0], names);
    },
  };
}
