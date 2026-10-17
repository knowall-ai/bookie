import { describe, expect, it } from 'vitest';
import {
  BC_ALLOCATION_NOTE,
  fromBcCreditMemo,
  mergeCreditMemos,
  toBcCreditMemo,
} from './credit-notes';
import { BC_HISTORY_NOTE, bcHistoryResult } from './history';

const CUSTOMER = 'c:11111111-2222-3333-4444-555555555555';
const VENDOR = 'v:66666666-7777-8888-9999-000000000000';

describe('bc credit memo writes', () => {
  it('writes sales and purchase credit memo headers', () => {
    expect(
      toBcCreditMemo({
        type: 'sales',
        contactId: CUSTOMER,
        date: '2026-05-01',
        reference: 'RMA-12',
        lineItems: [],
      })
    ).toEqual({
      customerId: '11111111-2222-3333-4444-555555555555',
      creditMemoDate: '2026-05-01',
      externalDocumentNumber: 'RMA-12',
      currencyCode: undefined,
    });
    expect(
      toBcCreditMemo({
        type: 'purchase',
        contactId: VENDOR,
        date: '2026-05-01',
        reference: 'VCM-77',
        lineItems: [],
      })
    ).toMatchObject({
      vendorId: '66666666-7777-8888-9999-000000000000',
      vendorCreditMemoNumber: 'VCM-77',
    });
  });

  it('refuses a supplier on a sales credit memo', () => {
    expect(() =>
      toBcCreditMemo({ type: 'sales', contactId: VENDOR, date: '2026-05-01', lineItems: [] })
    ).toThrow(/customer/);
  });

  it('maps applies-to, drafts and prices-include-tax from the API', () => {
    const note = fromBcCreditMemo(
      {
        id: 'cm-1',
        number: 'S-CR-1001',
        creditMemoDate: '2026-05-02',
        customerId: 'cust',
        customerName: 'Litware Cafe',
        status: 'Draft',
        pricesIncludeTax: false,
        totalAmountIncludingTax: 48,
        invoiceId: '00000000-0000-0000-0000-000000000000',
        invoiceNumber: '',
        lastModifiedDateTime: '2026-05-02T09:00:00Z',
      },
      'sales',
      'GBP'
    );
    expect(note).toMatchObject({
      status: 'draft',
      remainingCredit: 48,
      lineAmountType: 'exclusive',
      appliesTo: undefined,
      updatedAt: '2026-05-02T09:00:00Z',
    });
    expect(
      fromBcCreditMemo(
        {
          id: 'cm-2',
          number: 'S-CR-1002',
          status: 'Open',
          invoiceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          invoiceNumber: 'S-INV-1009',
        },
        'sales',
        'GBP'
      ).appliesTo
    ).toEqual({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', number: 'S-INV-1009' });
    expect(BC_ALLOCATION_NOTE).toMatch(/can't apply/);
  });
});

describe('bc credit memo search', () => {
  it('merges per-field results without duplicates, newest first', () => {
    const a = { id: 'a', number: 'S-CR-1', creditMemoDate: '2026-05-01', status: 'Open' };
    const b = { id: 'b', number: 'S-CR-2', creditMemoDate: '2026-05-03', status: 'Open' };
    const c = { id: 'c', number: 'S-CR-3', creditMemoDate: '2026-05-03', status: 'Draft' };
    expect(mergeCreditMemos([[a, b], [b, c], []]).map((m) => m.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('bc history', () => {
  it('offers last modified only, and says so', () => {
    expect(bcHistoryResult('2026-05-02T09:00:00Z')).toEqual({
      records: [{ date: '2026-05-02T09:00:00Z', change: 'Last modified' }],
      complete: false,
      note: BC_HISTORY_NOTE,
    });
    expect(bcHistoryResult(undefined).records).toEqual([]);
    expect(BC_HISTORY_NOTE).toBe("Full history isn't available from Business Central.");
  });
});
