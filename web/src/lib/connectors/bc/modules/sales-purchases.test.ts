import { describe, expect, it } from 'vitest';
import { bcQuoteStatus, fromBcSalesQuote, toBcSalesQuote } from './quotes';
import { fromBcCreditMemo } from './credit-notes';
import { fromBcPurchaseOrder, toBcPurchaseOrder } from './purchase-orders';
import { fromBcItem, toBcItem } from './items';
import { fromBcJournalPayment } from './payments';
import { toBcDocumentLine } from './document-lines';

/* Fixtures are shaped like BC API v2.0 responses, with fictional values. */

describe('bc sales quotes', () => {
  it('maps a quote, its lines and the 0001-01-01 "no date"', () => {
    const quote = fromBcSalesQuote(
      {
        id: 'q-1',
        number: '1001',
        externalDocumentNumber: '',
        documentDate: '2026-04-01',
        validUntilDate: '0001-01-01',
        customerId: 'cust-guid',
        customerName: 'Adventure Works Cycles',
        currencyCode: '',
        status: 'Draft',
        totalAmountExcludingTax: 100,
        totalTaxAmount: 20,
        totalAmountIncludingTax: 120,
        salesQuoteLines: [
          {
            id: 'l-1',
            lineType: 'Item',
            lineObjectNumber: '1896-S',
            description: 'Desk',
            quantity: 2,
            unitPrice: 50,
            discountPercent: 0,
            taxCode: 'VAT20',
            amountExcludingTax: 100,
            totalTaxAmount: 20,
          },
        ],
      },
      'GBP'
    );
    expect(quote).toMatchObject({
      contact: { id: 'c:cust-guid', name: 'Adventure Works Cycles' },
      date: '2026-04-01',
      expiryDate: undefined,
      reference: undefined,
      status: 'draft',
      currency: 'GBP',
      total: 120,
      lineItems: [{ itemCode: '1896-S', unitAmount: 50, taxType: 'VAT20', lineAmount: 100 }],
    });
  });

  it('treats expired quotes as sent and strips the contact prefix', () => {
    expect(bcQuoteStatus('Expired ')).toBe('sent');
    expect(bcQuoteStatus('Accepted')).toBe('accepted');
    expect(
      toBcSalesQuote({
        contactId: 'c:11111111-2222-3333-4444-555555555555',
        date: '2026-04-01',
        expiryDate: '2026-05-01',
        lineItems: [],
      })
    ).toMatchObject({
      customerId: '11111111-2222-3333-4444-555555555555',
      validUntilDate: '2026-05-01',
    });
  });
});

describe('bc credit memos', () => {
  it('maps sales and purchase memos', () => {
    expect(
      fromBcCreditMemo(
        {
          id: 'cm-1',
          number: '104001',
          creditMemoDate: '2026-02-02',
          customerId: 'cust',
          customerName: 'Litware Cafe',
          externalDocumentNumber: 'RMA-9',
          status: 'Open',
          totalAmountIncludingTax: 60,
        },
        'sales',
        'GBP'
      )
    ).toMatchObject({
      type: 'sales',
      status: 'authorised',
      reference: 'RMA-9',
      contact: { id: 'c:cust' },
      remainingCredit: 60,
    });
    expect(
      fromBcCreditMemo(
        {
          id: 'cm-2',
          number: '108001',
          vendorId: 'vend',
          vendorName: 'Trey Energy',
          vendorCreditMemoNumber: 'VCM-1',
          status: 'Paid',
          totalAmountIncludingTax: 30,
        },
        'purchase',
        'GBP'
      )
    ).toMatchObject({
      type: 'purchase',
      status: 'paid',
      reference: 'VCM-1',
      contact: { id: 'v:vend' },
      remainingCredit: 0,
    });
    expect(
      fromBcCreditMemo({ id: 'cm-3', number: '104002', status: 'Corrective' }, 'sales', 'GBP')
    ).toMatchObject({ status: 'paid', remainingCredit: 0 });
  });
});

describe('bc purchase orders', () => {
  it('maps released orders as approved and writes the header', () => {
    expect(
      fromBcPurchaseOrder(
        {
          id: 'po-1',
          number: '106001',
          orderDate: '2026-01-10',
          requestedReceiptDate: '2026-01-20',
          vendorId: 'vend',
          vendorName: 'Fabrikam Supplies',
          status: 'Open',
          totalAmountIncludingTax: 480,
        },
        'GBP'
      )
    ).toMatchObject({
      status: 'authorised',
      deliveryDate: '2026-01-20',
      contact: { id: 'v:vend' },
    });
    expect(
      toBcPurchaseOrder({
        contactId: 'v:11111111-2222-3333-4444-555555555555',
        date: '2026-01-10',
        lineItems: [],
      })
    ).toMatchObject({ vendorId: '11111111-2222-3333-4444-555555555555', orderDate: '2026-01-10' });
  });

  it('prices purchase lines with directUnitCost and comments without amounts', () => {
    expect(
      toBcDocumentLine(
        { itemCode: '1000', description: 'Bike', quantity: 2, unitAmount: 300 },
        'directUnitCost'
      )
    ).toMatchObject({ lineType: 'Item', lineObjectNumber: '1000', directUnitCost: 300 });
    expect(
      toBcDocumentLine({ description: 'Note', quantity: 1, unitAmount: 0 }, 'unitPrice')
    ).toEqual({ lineType: 'Comment', lineObjectNumber: undefined, description: 'Note' });
  });
});

describe('bc items', () => {
  it('maps inventory and service items', () => {
    expect(
      fromBcItem({
        id: 'i-1',
        number: '1896-S',
        displayName: 'ATHENS Desk',
        type: 'Inventory',
        inventory: 7,
        unitPrice: 1000.8,
        unitCost: 780.7,
      })
    ).toMatchObject({ code: '1896-S', isTracked: true, quantityOnHand: 7, salePrice: 1000.8 });
    expect(fromBcItem({ id: 'i-2', number: 'SVC', type: 'Service', inventory: 0 })).toMatchObject({
      name: 'SVC',
      isTracked: false,
      quantityOnHand: undefined,
    });
    expect(toBcItem({ code: 'NEW', name: 'New item', salePrice: 5 })).toMatchObject({
      number: 'NEW',
      displayName: 'New item',
      unitPrice: 5,
    });
  });
});

describe('bc journal payments', () => {
  it('maps a customer payment line', () => {
    expect(
      fromBcJournalPayment(
        {
          id: 'pay-1',
          journalDisplayName: 'GENERAL',
          customerId: 'cust',
          customerNumber: '10000',
          postingDate: '2026-03-03',
          documentNumber: 'G0001',
          amount: -250,
          appliesToInvoiceId: '00000000-0000-0000-0000-000000000000',
          appliesToInvoiceNumber: '',
        },
        'sales',
        'GBP'
      )
    ).toMatchObject({
      amount: 250,
      invoiceId: undefined,
      invoiceType: 'sales',
      contact: { id: 'c:cust', name: '10000' },
      reference: 'G0001',
    });
  });
});
