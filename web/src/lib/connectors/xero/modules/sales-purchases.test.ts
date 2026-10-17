import { describe, expect, it } from 'vitest';
import { fromXeroQuote, invoiceFromXeroQuote, toXeroQuote, type XeroQuote } from './quotes';
import { fromXeroCreditNote } from './credit-notes';
import { fromXeroPurchaseOrder, toXeroPurchaseOrder } from './purchase-orders';
import { fromXeroItem, toXeroItem } from './items';
import { fromXeroPayment, toXeroPayment } from './payments';

/* Fixtures are shaped like the real Xero responses, with fictional values. */

const quote: XeroQuote = {
  QuoteID: 'q-1',
  QuoteNumber: 'QU-0042',
  Reference: 'RFQ 12',
  Title: 'Espresso supply',
  Summary: 'Monthly beans',
  Terms: 'Valid 30 days',
  Contact: { ContactID: 'c-1', Name: 'Fabrikam Hotels' },
  Date: '/Date(1760313600000)/',
  DateString: '2025-10-13T00:00:00',
  ExpiryDateString: '2025-11-12T00:00:00',
  Status: 'SENT',
  LineAmountTypes: 'EXCLUSIVE',
  CurrencyCode: 'GBP',
  SubTotal: 100,
  TotalTax: 20,
  Total: 120,
  LineItems: [
    {
      LineItemID: 'l-1',
      ItemCode: 'ESP-1KG',
      Description: 'Espresso blend',
      Quantity: 4,
      UnitAmount: 25,
      AccountCode: '200',
      TaxType: 'OUTPUT2',
      TaxAmount: 20,
      LineAmount: 100,
    },
  ],
  UpdatedDateUTC: '/Date(1760400000000)/',
};

describe('xero quotes', () => {
  it('maps a sent quote with upper-case line amount types', () => {
    expect(fromXeroQuote(quote)).toMatchObject({
      id: 'q-1',
      number: 'QU-0042',
      status: 'sent',
      date: '2025-10-13',
      expiryDate: '2025-11-12',
      lineAmountType: 'exclusive',
      title: 'Espresso supply',
      total: 120,
      contact: { id: 'c-1', name: 'Fabrikam Hotels' },
      lineItems: [{ itemCode: 'ESP-1KG', quantity: 4, lineAmount: 100 }],
    });
    expect(
      fromXeroQuote({ ...quote, LineAmountTypes: 'NOTAX', ExpiryDateString: null })
    ).toMatchObject({ lineAmountType: 'none', expiryDate: undefined });
  });

  it('builds a quote body and a draft invoice from a quote', () => {
    const body = toXeroQuote({
      contactId: 'c-1',
      date: '2026-01-02',
      expiryDate: '2026-02-01',
      title: 'Beans',
      lineAmountType: 'inclusive',
      lineItems: [{ description: 'Beans', quantity: 1, unitAmount: 10 }],
    });
    expect(body).toMatchObject({
      Contact: { ContactID: 'c-1' },
      ExpiryDate: '2026-02-01',
      LineAmountTypes: 'INCLUSIVE',
      Title: 'Beans',
    });
    expect(body).not.toHaveProperty('QuoteID');
    const invoice = invoiceFromXeroQuote(quote);
    expect(invoice).toMatchObject({
      Type: 'ACCREC',
      Status: 'DRAFT',
      Reference: 'QU-0042',
      LineAmountTypes: 'Exclusive',
      LineItems: [{ ItemCode: 'ESP-1KG', Quantity: 4, UnitAmount: 25, AccountCode: '200' }],
    });
  });
});

describe('xero credit notes', () => {
  it('maps type, status and remaining credit', () => {
    const note = fromXeroCreditNote({
      CreditNoteID: 'cn-1',
      CreditNoteNumber: 'CN-0007',
      Type: 'ACCPAYCREDIT',
      Contact: { ContactID: 's-1', Name: 'Coho Packaging' },
      DateString: '2026-03-01T00:00:00',
      Status: 'AUTHORISED',
      CurrencyCode: 'GBP',
      SubTotal: 50,
      TotalTax: 10,
      Total: 60,
      RemainingCredit: 25,
    });
    expect(note).toMatchObject({
      type: 'purchase',
      status: 'authorised',
      date: '2026-03-01',
      remainingCredit: 25,
    });
    expect(
      fromXeroCreditNote({
        CreditNoteID: 'cn-2',
        Type: 'ACCRECCREDIT',
        Contact: { ContactID: 'c', Name: 'Northwind' },
        Status: 'VOIDED',
        Total: 60,
        RemainingCredit: 60,
      })
    ).toMatchObject({ type: 'sales', status: 'voided', remainingCredit: 0 });
  });
});

describe('xero purchase orders', () => {
  it('maps a billed order and writes a draft body', () => {
    expect(
      fromXeroPurchaseOrder({
        PurchaseOrderID: 'po-1',
        PurchaseOrderNumber: 'PO-0001',
        Contact: { ContactID: 's-1', Name: 'Alpine Green Beans' },
        DateString: '2026-02-01T00:00:00',
        DeliveryDateString: '2026-02-15T00:00:00',
        Status: 'BILLED',
        Total: 240,
      })
    ).toMatchObject({ status: 'billed', deliveryDate: '2026-02-15', total: 240 });
    expect(
      toXeroPurchaseOrder({
        contactId: 's-1',
        date: '2026-02-01',
        deliveryDate: '2026-02-10',
        lineItems: [{ description: 'Beans', quantity: 10, unitAmount: 9 }],
      })
    ).toMatchObject({
      Contact: { ContactID: 's-1' },
      DeliveryDate: '2026-02-10',
      LineAmountTypes: 'Exclusive',
    });
  });
});

describe('xero items', () => {
  it('maps sales and purchase details', () => {
    expect(
      fromXeroItem({
        ItemID: 'i-1',
        Code: 'TRAIN',
        Name: 'Barista training',
        IsSold: true,
        IsPurchased: false,
        IsTrackedAsInventory: false,
        SalesDetails: { UnitPrice: 350, AccountCode: '260', TaxType: 'OUTPUT2' },
        PurchaseDetails: {},
      })
    ).toMatchObject({
      code: 'TRAIN',
      salePrice: 350,
      salesAccountCode: '260',
      purchasePrice: undefined,
      isSold: true,
      isPurchased: false,
      quantityOnHand: undefined,
    });
  });

  it('only sends the sides that have details', () => {
    const body = toXeroItem({ code: 'CUPS', name: 'Cups', purchasePrice: 64 });
    expect(body).toMatchObject({
      IsSold: false,
      IsPurchased: true,
      PurchaseDetails: { UnitPrice: 64 },
    });
    expect(body.SalesDetails).toBeUndefined();
  });
});

describe('xero payments', () => {
  it('maps a receivable payment with its invoice and contact', () => {
    expect(
      fromXeroPayment({
        PaymentID: 'p-1',
        Date: '/Date(1760313600000+0000)/',
        Amount: 120,
        Reference: '',
        PaymentType: 'ACCRECPAYMENT',
        Status: 'AUTHORISED',
        Account: { AccountID: 'bank-1', CurrencyCode: 'GBP' },
        Invoice: {
          InvoiceID: 'inv-1',
          InvoiceNumber: 'INV-0101',
          Type: 'ACCREC',
          CurrencyCode: 'GBP',
          Contact: { ContactID: 'c-1', Name: 'Tailspin Toys' },
        },
      })
    ).toMatchObject({
      id: 'p-1',
      date: '2025-10-13',
      amount: 120,
      reference: undefined,
      invoiceType: 'sales',
      invoiceNumber: 'INV-0101',
      contact: { id: 'c-1', name: 'Tailspin Toys' },
      bankAccountId: 'bank-1',
      status: 'authorised',
    });
  });

  it('builds the PUT Payments body', () => {
    expect(
      toXeroPayment({ invoiceId: 'inv-1', bankAccountId: 'bank-1', date: '2026-01-05', amount: 50 })
    ).toEqual({
      Invoice: { InvoiceID: 'inv-1' },
      Account: { AccountID: 'bank-1' },
      Date: '2026-01-05',
      Amount: 50,
      Reference: undefined,
    });
  });
});
