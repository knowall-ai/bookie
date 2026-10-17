import { describe, expect, it } from 'vitest';
import type { Invoice } from '@/lib/domain/types';
import { fromXeroInvoice, toXeroInvoice, type XeroInvoice } from './xero/mappers';
import { invoiceBuckets } from './buckets';
import { fromXeroCurrency, xeroCurrencies } from './xero/modules/currencies';
import { fromXeroPayment, toXeroPayment } from './xero/modules/payments';
import { fromXeroQuote, toXeroQuote } from './xero/modules/quotes';
import { fromXeroCreditNote } from './xero/modules/credit-notes';
import { fromXeroPurchaseOrder, toXeroPurchaseOrder } from './xero/modules/purchase-orders';
import type { XeroClient } from './xero/client';
import { bcCurrencyList } from './bc/modules/currencies';
import { createDemoConnector, DEMO_ORGS } from './demo/index';
import { demoInBase } from './demo/modules/currencies';

/* Fixtures are shaped like the real API responses, with fictional values. */

const eurInvoice: XeroInvoice = {
  InvoiceID: 'inv-eur',
  InvoiceNumber: 'INV-0101',
  Type: 'ACCREC',
  Contact: { ContactID: 'c-fr', Name: 'Fabrikam Hôtels Paris' },
  DateString: '2026-09-01T00:00:00',
  DueDateString: '2026-10-01T00:00:00',
  Status: 'AUTHORISED',
  LineAmountTypes: 'Exclusive',
  SubTotal: 1164.8,
  TotalTax: 0,
  Total: 1164.8,
  AmountDue: 1164.8,
  AmountPaid: 0,
  CurrencyCode: 'EUR',
  CurrencyRate: 1.1648,
};

const gbpInvoice: XeroInvoice = {
  ...eurInvoice,
  InvoiceID: 'inv-gbp',
  CurrencyCode: 'GBP',
  CurrencyRate: 1,
  Total: 240,
  SubTotal: 200,
  TotalTax: 40,
  AmountDue: 240,
  DueDateString: '2099-01-01T00:00:00',
};

describe('Xero multi-currency', () => {
  it('maps the invoice CurrencyRate and writes it back only with a currency', () => {
    expect(fromXeroInvoice(eurInvoice)).toMatchObject({ currency: 'EUR', currencyRate: 1.1648 });
    const input = {
      type: 'sales' as const,
      contactId: 'c-fr',
      date: '2026-10-01',
      lineItems: [{ description: 'Espresso', quantity: 1, unitAmount: 10 }],
    };
    expect(toXeroInvoice({ ...input, currency: 'EUR', currencyRate: 1.16 })).toMatchObject({
      CurrencyCode: 'EUR',
      CurrencyRate: 1.16,
    });
    const noRate = toXeroInvoice({ ...input, currency: 'EUR' });
    expect(noRate.CurrencyRate).toBeUndefined();
    expect(toXeroInvoice({ ...input, currencyRate: 1.16 }).CurrencyRate).toBeUndefined();
  });

  it('maps CurrencyRate on quotes, credit notes and purchase orders', () => {
    const lines = { LineItems: [] };
    expect(
      fromXeroQuote({
        QuoteID: 'q',
        Contact: { ContactID: 'c', Name: 'Fabrikam' },
        Status: 'DRAFT',
        CurrencyCode: 'EUR',
        CurrencyRate: 1.15,
        ...lines,
      })
    ).toMatchObject({ currency: 'EUR', currencyRate: 1.15 });
    expect(
      fromXeroCreditNote({
        CreditNoteID: 'cn',
        Type: 'ACCRECCREDIT',
        Contact: { ContactID: 'c', Name: 'Fabrikam' },
        Status: 'AUTHORISED',
        CurrencyCode: 'EUR',
        CurrencyRate: 1.2,
        ...lines,
      })
    ).toMatchObject({ currency: 'EUR', currencyRate: 1.2 });
    expect(
      fromXeroPurchaseOrder({
        PurchaseOrderID: 'po',
        Contact: { ContactID: 'c', Name: 'Northwind' },
        Status: 'DRAFT',
        CurrencyCode: 'USD',
        CurrencyRate: 1.3,
        ...lines,
      })
    ).toMatchObject({ currency: 'USD', currencyRate: 1.3 });
    const base = { contactId: 'c', date: '2026-10-01', lineItems: [] };
    expect(toXeroQuote({ ...base, currency: 'EUR', currencyRate: 1.15 })).toMatchObject({
      CurrencyCode: 'EUR',
      CurrencyRate: 1.15,
    });
    expect(toXeroPurchaseOrder({ ...base, currency: 'USD', currencyRate: 1.3 })).toMatchObject({
      CurrencyCode: 'USD',
      CurrencyRate: 1.3,
    });
  });

  it('maps a payment on a euro invoice into a sterling account, with BankAmount', () => {
    const payment = fromXeroPayment({
      PaymentID: 'p-1',
      Date: '/Date(1760313600000+0000)/',
      Amount: 116.48,
      BankAmount: 100,
      CurrencyRate: 1.1648,
      PaymentType: 'ACCRECPAYMENT',
      Status: 'AUTHORISED',
      Account: { AccountID: 'bank-gbp', CurrencyCode: 'GBP' },
      Invoice: { InvoiceID: 'inv-eur', Type: 'ACCREC', CurrencyCode: 'EUR' },
    });
    expect(payment).toMatchObject({
      amount: 116.48,
      currency: 'EUR',
      bankAmount: 100,
      bankCurrency: 'GBP',
      currencyRate: 1.1648,
    });
    expect(
      toXeroPayment({
        invoiceId: 'inv-eur',
        bankAccountId: 'bank-gbp',
        date: '2026-10-10',
        amount: 116.48,
        currencyRate: 1.1648,
      })
    ).toMatchObject({ Amount: 116.48, CurrencyRate: 1.1648 });
  });

  it('dashboard buckets total each currency separately, never converting or adding EUR to GBP', () => {
    const buckets = invoiceBuckets([eurInvoice, gbpInvoice].map(fromXeroInvoice), 'GBP');
    expect(buckets.awaitingPayment).toEqual({
      count: 2,
      total: undefined,
      byCurrency: [
        { currency: 'GBP', total: 240 },
        { currency: 'EUR', total: 1164.8 },
      ],
    });
    expect(buckets.overdue).toMatchObject({
      count: 1,
      total: undefined,
      byCurrency: [{ currency: 'EUR', total: 1164.8 }],
    });
  });

  it('lists the enabled currencies from GET Currencies', async () => {
    expect(fromXeroCurrency({ Code: 'EUR', Description: 'Euro' })).toEqual({
      code: 'EUR',
      name: 'Euro',
    });
    const client = {
      request: async () => ({
        Currencies: [
          { Code: 'GBP', Description: 'British Pound' },
          { Code: 'EUR', Description: 'Euro' },
        ],
      }),
    } as unknown as XeroClient;
    const currencies = xeroCurrencies(client);
    expect(currencies.acceptsRate).toBe(true);
    expect((await currencies.list()).map((c) => c.code)).toEqual(['GBP', 'EUR']);
  });
});

describe('Business Central multi-currency', () => {
  it('puts the local currency first; BC lists only foreign currencies', () => {
    expect(
      bcCurrencyList(
        [
          { id: '2', code: 'USD', displayName: 'US dollar' },
          { id: '1', code: 'EUR', displayName: 'Euro' },
        ],
        'GBP'
      )
    ).toEqual([{ code: 'GBP' }, { code: 'EUR', name: 'Euro' }, { code: 'USD', name: 'US dollar' }]);
  });

  it('dashboard totals foreign documents in their own currency (BC gives no rate)', () => {
    const doc = (currency: string, total: number): Invoice => ({
      id: currency + total,
      type: 'sales',
      number: 'S-1',
      contact: { id: 'c:1', name: 'Contoso' },
      date: '2026-10-01',
      status: 'draft',
      currency,
      subTotal: total,
      totalTax: 0,
      total,
      amountDue: total,
      amountPaid: 0,
      isOverdue: false,
    });
    const buckets = invoiceBuckets([doc('GBP', 100), doc('EUR', 500), doc('EUR', 50)], 'GBP');
    expect(buckets.draft).toEqual({
      count: 3,
      total: undefined,
      byCurrency: [
        { currency: 'GBP', total: 100 },
        { currency: 'EUR', total: 550 },
      ],
    });
  });
});

describe('demo multi-currency', () => {
  it('has a euro customer and euro invoices with their own rates', async () => {
    const demo = createDemoConnector(DEMO_ORGS[0]);
    const currencies = await demo.currencies!.list();
    expect(currencies.map((c) => c.code)).toEqual(['GBP', 'EUR', 'USD']);
    const customer = await demo.contacts!.get('cust-eur-1');
    expect(customer.currency).toBe('EUR');
    const invoice = await demo.invoices!.get('inv-eur-2');
    expect(invoice).toMatchObject({ currency: 'EUR', currencyRate: 1.1648, status: 'authorised' });
  });

  it('converts to GBP for the ledger at the invoice rate, and refuses to guess without one', () => {
    const base = {
      id: 'x',
      type: 'sales' as const,
      number: 'INV-1',
      contact: { id: 'c', name: 'Fabrikam' },
      date: '2026-10-01',
      status: 'authorised' as const,
      subTotal: 116.48,
      totalTax: 0,
      total: 116.48,
      amountDue: 116.48,
      amountPaid: 0,
      isOverdue: false,
    };
    expect(demoInBase({ ...base, currency: 'EUR', currencyRate: 1.1648 })).toMatchObject({
      currency: 'GBP',
      total: 100,
      amountDue: 100,
    });
    expect(demoInBase({ ...base, currency: 'EUR' })).toBeUndefined();
  });

  it('records a euro payment into a sterling account at the entered rate', async () => {
    const demo = createDemoConnector(DEMO_ORGS[1]);
    const before = (await demo.bank!.accounts()).find((b) => b.id === 'acc-090')!.balance!;
    const payment = await demo.payments!.create!({
      invoiceId: 'inv-eur-2',
      bankAccountId: 'acc-090',
      date: '2026-10-10',
      amount: 125,
      currencyRate: 1.25,
    });
    expect(payment).toMatchObject({ amount: 125, currency: 'EUR', bankAmount: 100 });
    const after = (await demo.bank!.accounts()).find((b) => b.id === 'acc-090')!.balance!;
    expect(Math.round((after - before) * 100) / 100).toBe(100);
  });
});
