import { describe, expect, it } from 'vitest';
import type { XeroClient } from '../client';
import { fromXeroBankTransfer, toXeroBankTransfer, xeroTransfers } from './transfers';
import {
  fromXeroBatchPayment,
  toXeroBatchPayment,
  xeroBatchPayments,
  type XeroBatchPayment,
} from './batch-payments';
import { toXeroPurchaseOrderStatus, xeroPurchaseOrders } from './purchase-orders';

/* Fixtures are shaped like the live API responses (GET BankTransfers / BatchPayments), fictional values. */

const CURRENT = '9a1b2c3d-0000-4000-8000-000000000001';
const SAVINGS = '9a1b2c3d-0000-4000-8000-000000000002';
const EURO = '9a1b2c3d-0000-4000-8000-000000000003';

const transfer = {
  BankTransferID: 'bt-1',
  CreatedDateUTCString: '2026-10-01T10:00:00',
  CreatedDateUTC: '/Date(1790848800000+0000)/',
  DateString: '2026-10-01T00:00:00',
  Date: '/Date(1790812800000+0000)/',
  FromBankAccount: { AccountID: CURRENT, Name: 'Business Current Account' },
  ToBankAccount: { AccountID: SAVINGS, Name: 'Business Savings Account' },
  FromTracking: [],
  ToTracking: [],
  Amount: 1500,
  FromBankTransactionID: 'tx-from',
  ToBankTransactionID: 'tx-to',
  FromIsReconciled: true,
  ToIsReconciled: false,
  CurrencyRate: 1,
  Reference: 'Monthly sweep',
  HasAttachments: false,
  Status: 'AUTHORISED' as const,
};

const batch: XeroBatchPayment = {
  Account: { AccountID: CURRENT, CurrencyCode: 'GBP' },
  BatchPaymentID: 'bp-1',
  DateString: '2026-10-02T00:00:00',
  Date: '/Date(1790899200000+0000)/',
  Payments: [
    { PaymentID: 'p-1', Amount: 120, Invoice: { InvoiceID: 'bill-1' } },
    { PaymentID: 'p-2', Amount: 80.5, Invoice: { InvoiceID: 'bill-2' } },
  ],
  Type: 'PAYBATCH',
  Status: 'AUTHORISED',
  TotalAmount: 200.5,
  IsReconciled: false,
  Details: 'OCT SUPPLIERS',
};

/** A fake client that answers by path and records writes. */
function fakeClient(answers: Record<string, unknown>) {
  const calls: { path: string; method?: string; body?: unknown; query?: unknown }[] = [];
  const client = {
    async request(path: string, init?: { method?: string; body?: unknown; query?: unknown }) {
      calls.push({ path, ...init });
      const key = `${init?.method ?? 'GET'} ${path}`;
      if (!(key in answers)) throw new Error(`unexpected ${key}`);
      return answers[key];
    },
  } as unknown as XeroClient;
  return { client, calls };
}

const accounts = {
  Accounts: [
    { AccountID: CURRENT, Name: 'Business Current Account', Type: 'BANK', CurrencyCode: 'GBP' },
    { AccountID: SAVINGS, Name: 'Business Savings Account', Type: 'BANK' },
    { AccountID: EURO, Name: 'Euro Account', Type: 'BANK', CurrencyCode: 'EUR' },
  ],
};

describe('xero bank transfers', () => {
  it('maps a transfer, taking the currency only from the chart of accounts', () => {
    expect(fromXeroBankTransfer(transfer, new Map([[CURRENT, 'GBP']]))).toEqual({
      id: 'bt-1',
      date: '2026-10-01',
      from: { id: CURRENT, name: 'Business Current Account' },
      to: { id: SAVINGS, name: 'Business Savings Account' },
      amount: 1500,
      currency: 'GBP',
      reference: 'Monthly sweep',
      fromIsReconciled: true,
      toIsReconciled: false,
      status: 'authorised',
    });
    expect(fromXeroBankTransfer(transfer).currency).toBeUndefined();
  });

  it('builds the PUT body', () => {
    expect(
      toXeroBankTransfer({
        fromBankAccountId: CURRENT,
        toBankAccountId: SAVINGS,
        date: '2026-10-05',
        amount: 250,
        reference: '',
      })
    ).toEqual({
      FromBankAccount: { AccountID: CURRENT },
      ToBankAccount: { AccountID: SAVINGS },
      Date: '2026-10-05',
      Amount: 250,
      Reference: undefined,
    });
  });

  it('lists newest first and pages locally (GET BankTransfers has no paging)', async () => {
    const { client } = fakeClient({
      'GET BankTransfers': {
        BankTransfers: [transfer, { ...transfer, BankTransferID: 'bt-2', Status: 'DELETED' }],
      },
      'GET Accounts': accounts,
      'GET Organisation': { Organisations: [{ BaseCurrency: 'GBP' }] },
    });
    const page = await xeroTransfers(client).transfers!({ pageSize: 10 });
    expect(page.items.map((t) => t.id)).toEqual(['bt-1']);
    expect(page.items[0].currency).toBe('GBP');
    expect(page.hasMore).toBe(false);
  });

  it('refuses transfers across currencies before calling Xero', async () => {
    const { client, calls } = fakeClient({
      'GET Accounts': accounts,
      'GET Organisation': { Organisations: [{ BaseCurrency: 'GBP' }] },
    });
    await expect(
      xeroTransfers(client).createTransfer!({
        fromBankAccountId: CURRENT,
        toBankAccountId: EURO,
        date: '2026-10-05',
        amount: 10,
      })
    ).rejects.toThrow(/exchange rate/);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('PUTs a same-currency transfer (savings has no CurrencyCode: base currency)', async () => {
    const { client, calls } = fakeClient({
      'GET Accounts': accounts,
      'GET Organisation': { Organisations: [{ BaseCurrency: 'GBP' }] },
      'PUT BankTransfers': { BankTransfers: [transfer] },
    });
    const created = await xeroTransfers(client).createTransfer!({
      fromBankAccountId: CURRENT,
      toBankAccountId: SAVINGS,
      date: '2026-10-01',
      amount: 1500,
      reference: 'Monthly sweep',
    });
    expect(created.id).toBe('bt-1');
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
      BankTransfers: [
        {
          FromBankAccount: { AccountID: CURRENT },
          ToBankAccount: { AccountID: SAVINGS },
          Date: '2026-10-01',
          Amount: 1500,
          Reference: 'Monthly sweep',
        },
      ],
    });
  });
});

describe('xero batch payments', () => {
  it('maps a batch, reading the reference from Details outside NZ', () => {
    expect(fromXeroBatchPayment(batch, new Map([[CURRENT, 'Business Current Account']]))).toEqual({
      id: 'bp-1',
      date: '2026-10-02',
      type: 'purchase',
      bankAccountId: CURRENT,
      bankAccountName: 'Business Current Account',
      currency: 'GBP',
      reference: 'OCT SUPPLIERS',
      total: 200.5,
      payments: [
        { id: 'p-1', invoiceId: 'bill-1', amount: 120 },
        { id: 'p-2', invoiceId: 'bill-2', amount: 80.5 },
      ],
      isReconciled: false,
      status: 'authorised',
    });
    expect(fromXeroBatchPayment({ ...batch, Type: 'RECBATCH' }).type).toBe('sales');
  });

  it('sends the reference as Details (18 max) or, in NZ, as Reference', () => {
    const input = {
      bankAccountId: CURRENT,
      date: '2026-10-02',
      reference: 'OCT SUPPLIERS',
      payments: [{ invoiceId: 'bill-1', amount: 120 }],
    };
    expect(toXeroBatchPayment(input, 'GB')).toEqual({
      Account: { AccountID: CURRENT },
      Date: '2026-10-02',
      Details: 'OCT SUPPLIERS',
      Payments: [{ Invoice: { InvoiceID: 'bill-1' }, Amount: 120 }],
    });
    expect(toXeroBatchPayment(input, 'NZ')).toMatchObject({ Reference: 'OCT SUPPLIERS' });
    expect(() => toXeroBatchPayment({ ...input, reference: 'x'.repeat(19) }, 'GB')).toThrow(/18/);
  });

  it('lists authorised batches with bank names', async () => {
    const { client } = fakeClient({
      'GET BatchPayments': {
        BatchPayments: [batch, { ...batch, BatchPaymentID: 'bp-x', Status: 'DELETED' }],
      },
      'GET Accounts': accounts,
    });
    const page = await xeroBatchPayments(client).batches!();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].bankAccountName).toBe('Business Current Account');
  });
});

describe('xero purchase order status', () => {
  it('updates status only, by id', async () => {
    expect(toXeroPurchaseOrderStatus('po-1', 'billed')).toEqual({
      PurchaseOrderID: 'po-1',
      Status: 'BILLED',
    });
    const { client, calls } = fakeClient({
      'POST PurchaseOrders': {
        PurchaseOrders: [
          {
            PurchaseOrderID: 'po-1',
            PurchaseOrderNumber: 'PO-0001',
            Contact: { ContactID: 'c1', Name: 'Fabrikam Beans' },
            Status: 'SUBMITTED',
            Total: 10,
          },
        ],
      },
    });
    const mod = xeroPurchaseOrders(client)!;
    expect(mod.statusChanges).toEqual(['submitted', 'authorised', 'billed', 'deleted']);
    const order = await mod.setStatus!('po-1', 'submitted');
    expect(order.status).toBe('submitted');
    expect(calls[0].body).toEqual({
      PurchaseOrders: [{ PurchaseOrderID: 'po-1', Status: 'SUBMITTED' }],
    });
  });
});
