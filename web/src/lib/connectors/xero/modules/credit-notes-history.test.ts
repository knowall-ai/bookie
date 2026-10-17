import { describe, expect, it } from 'vitest';
import {
  fromXeroAllocation,
  fromXeroCreditNote,
  toXeroAllocation,
  toXeroCreditNote,
} from './credit-notes';
import { fromXeroHistoryRecord } from './history';
import { fromXeroBrandingThemes } from './invoice-extras';
import { fromXeroInvoice, toXeroInvoice } from '../mappers';

/* Shaped like the real Xero responses (GET CreditNotes/{id}, {Endpoint}/{id}/History,
   BrandingThemes), with fictional values. */

describe('xero credit note allocations', () => {
  it('maps allocations and keeps remaining credit as Xero reports it', () => {
    const note = fromXeroCreditNote({
      CreditNoteID: 'cn-1',
      CreditNoteNumber: 'CN-0101',
      Type: 'ACCRECCREDIT',
      Contact: { ContactID: 'c-1', Name: 'Northwind Traders' },
      DateString: '2026-05-04T00:00:00',
      Status: 'AUTHORISED',
      LineAmountTypes: 'Exclusive',
      CurrencyCode: 'GBP',
      SubTotal: 100,
      TotalTax: 20,
      Total: 120,
      RemainingCredit: 70,
      Allocations: [
        {
          AllocationID: 'al-1',
          Amount: 50,
          Date: '/Date(1777852800000+0000)/',
          Invoice: { InvoiceID: 'inv-9', InvoiceNumber: 'INV-0009' },
        },
        // Malformed rows are dropped rather than shown as zero.
        { AllocationID: 'al-2', Invoice: { InvoiceID: 'inv-10' } },
      ],
    });
    expect(note).toMatchObject({
      remainingCredit: 70,
      lineAmountType: 'exclusive',
      allocations: [
        {
          id: 'al-1',
          amount: 50,
          date: '2026-05-04',
          invoice: { id: 'inv-9', number: 'INV-0009' },
        },
      ],
    });
  });

  it('never invents remaining credit for an approved note', () => {
    const note = fromXeroCreditNote({
      CreditNoteID: 'cn-2',
      Type: 'ACCPAYCREDIT',
      Contact: { ContactID: 's-1', Name: 'Coho Packaging' },
      Status: 'AUTHORISED',
      Total: 60,
    });
    expect(note.remainingCredit).toBeUndefined();
    expect(fromXeroAllocation({ Amount: 5 })).toBeUndefined();
  });

  it('writes credit note and allocation bodies', () => {
    expect(
      toXeroCreditNote({
        type: 'purchase',
        contactId: 's-1',
        date: '2026-05-01',
        reference: 'Damaged pallets',
        lineAmountType: 'inclusive',
        status: 'authorised',
        lineItems: [
          { description: 'Pallet refund', quantity: 2, unitAmount: 15, accountCode: '310' },
        ],
      })
    ).toMatchObject({
      Type: 'ACCPAYCREDIT',
      Contact: { ContactID: 's-1' },
      Reference: 'Damaged pallets',
      LineAmountTypes: 'Inclusive',
      Status: 'AUTHORISED',
      LineItems: [
        { Description: 'Pallet refund', Quantity: 2, UnitAmount: 15, AccountCode: '310' },
      ],
    });
    expect(
      toXeroCreditNote({ type: 'sales', contactId: 'c', date: '2026-05-01', lineItems: [] }, 'cn-1')
    ).toMatchObject({ CreditNoteID: 'cn-1', Type: 'ACCRECCREDIT', Status: 'DRAFT' });
    expect(toXeroAllocation({ invoiceId: 'inv-9', amount: 25, date: '2026-05-06' })).toEqual({
      Allocations: [{ Invoice: { InvoiceID: 'inv-9' }, Amount: 25, Date: '2026-05-06' }],
    });
  });
});

describe('xero history', () => {
  it('maps history records with UTC timestamps', () => {
    expect(
      fromXeroHistoryRecord({
        Changes: 'Approved',
        DateUTCString: '2026-05-04T10:15:00',
        DateUTC: '/Date(1777889700000+0000)/',
        User: 'Alex Morgan',
        Details: 'INV-0009 to Northwind Traders for 120.00.',
      })
    ).toEqual({
      date: '2026-05-04T10:15:00.000Z',
      change: 'Approved',
      user: 'Alex Morgan',
      details: 'INV-0009 to Northwind Traders for 120.00.',
    });
    expect(
      fromXeroHistoryRecord({ Changes: 'Note', DateUTCString: '2026-05-04T10:15:00' })
    ).toMatchObject({
      date: '2026-05-04T10:15:00Z',
      change: 'Note',
      user: undefined,
    });
    expect(fromXeroHistoryRecord({ Changes: 'Edited' })).toBeUndefined();
  });
});

describe('xero invoice extras', () => {
  it('orders branding themes and carries the theme on invoices', () => {
    expect(
      fromXeroBrandingThemes([
        { BrandingThemeID: 't-2', Name: 'Wholesale', SortOrder: 1, Type: 'INVOICE' },
        { BrandingThemeID: 't-1', Name: 'Standard', SortOrder: 0, Type: 'INVOICE' },
      ])
    ).toEqual([
      { id: 't-1', name: 'Standard', sortOrder: 0 },
      { id: 't-2', name: 'Wholesale', sortOrder: 1 },
    ]);
    expect(
      fromXeroInvoice({
        InvoiceID: 'inv-1',
        Type: 'ACCREC',
        Contact: { ContactID: 'c', Name: 'Northwind' },
        Status: 'AUTHORISED',
        BrandingThemeID: 't-2',
        SentToContact: true,
      })
    ).toMatchObject({ brandingThemeId: 't-2', sentToContact: true });
    expect(
      toXeroInvoice({
        type: 'sales',
        contactId: 'c',
        date: '2026-05-01',
        brandingThemeId: 't-2',
        lineItems: [],
      })
    ).toMatchObject({ BrandingThemeID: 't-2' });
  });
});
