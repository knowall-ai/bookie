import type { InvoiceType, Payment, PaymentInput } from '@/lib/domain/types';
import type { PaymentsModule } from '../../types';
import { xeroDate, type XeroClient } from '../client';
import { xeroBatchPayments } from './batch-payments';

const DEFAULT_PAGE_SIZE = 50;

export interface XeroPayment {
  PaymentID: string;
  Date?: string;
  Amount?: number;
  Reference?: string;
  CurrencyRate?: number;
  PaymentType?: string;
  Status?: 'AUTHORISED' | 'DELETED';
  IsReconciled?: boolean;
  Account?: { AccountID: string; Code?: string; Name?: string; CurrencyCode?: string };
  Invoice?: {
    InvoiceID: string;
    InvoiceNumber?: string;
    Type?: 'ACCREC' | 'ACCPAY';
    CurrencyCode?: string;
    Contact?: { ContactID: string; Name: string };
  };
}

const PAYMENT_TYPE: Record<InvoiceType, string> = {
  sales: 'ACCRECPAYMENT',
  purchase: 'ACCPAYPAYMENT',
};

export function fromXeroPayment(raw: XeroPayment): Payment {
  const invoiceType =
    raw.Invoice?.Type === 'ACCREC' || raw.PaymentType === 'ACCRECPAYMENT'
      ? 'sales'
      : raw.Invoice?.Type === 'ACCPAY' || raw.PaymentType === 'ACCPAYPAYMENT'
        ? 'purchase'
        : undefined;
  return {
    id: raw.PaymentID,
    date: xeroDate(raw.Date) ?? '',
    amount: raw.Amount ?? 0,
    currency: raw.Invoice?.CurrencyCode ?? raw.Account?.CurrencyCode,
    reference: raw.Reference || undefined,
    invoiceId: raw.Invoice?.InvoiceID,
    invoiceNumber: raw.Invoice?.InvoiceNumber || undefined,
    invoiceType,
    contact: raw.Invoice?.Contact
      ? { id: raw.Invoice.Contact.ContactID, name: raw.Invoice.Contact.Name }
      : undefined,
    bankAccountId: raw.Account?.AccountID,
    bankAccountName: raw.Account?.Name || undefined,
    status: raw.Status === 'DELETED' ? 'deleted' : 'authorised',
  };
}

export function toXeroPayment(input: PaymentInput): Record<string, unknown> {
  return {
    Invoice: { InvoiceID: input.invoiceId },
    Account: { AccountID: input.bankAccountId },
    Date: input.date,
    Amount: input.amount,
    Reference: input.reference || undefined,
  };
}

export function xeroPayments(client: XeroClient): PaymentsModule | undefined {
  return {
    ...xeroBatchPayments(client),
    async list(query) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const where: string[] = [];
      if (query?.invoiceType) where.push(`PaymentType=="${PAYMENT_TYPE[query.invoiceType]}"`);
      if (query?.status !== 'deleted') where.push('Status=="AUTHORISED"');
      if (query?.from) where.push(`Date>=DateTime(${query.from.replaceAll('-', ',')})`);
      if (query?.to) where.push(`Date<=DateTime(${query.to.replaceAll('-', ',')})`);
      const result = await client.request<{ Payments: XeroPayment[] }>('Payments', {
        query: {
          where: where.join(' AND ') || undefined,
          order: 'Date DESC',
          page,
          pageSize,
        },
      });
      const all = result.Payments ?? [];
      const items = all
        .map(fromXeroPayment)
        .filter((p) => !query?.contactId || p.contact?.id === query.contactId);
      return { items, page, pageSize, hasMore: all.length >= pageSize };
    },
    async create(input) {
      const result = await client.request<{ Payments: XeroPayment[] }>('Payments', {
        method: 'PUT',
        body: { Payments: [toXeroPayment(input)] },
      });
      return fromXeroPayment(result.Payments[0]);
    },
  };
}
