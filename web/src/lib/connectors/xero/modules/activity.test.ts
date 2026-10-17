import { describe, expect, it } from 'vitest';
import { aggregateActivity } from '@/lib/domain/activity';
import { xeroActivityEvents } from './activity';

// Shaped like Xero's Invoices (summaryOnly), Payments, Quotes and CreditNotes responses.
const sources = {
  invoices: [
    {
      Type: 'ACCREC',
      Status: 'AUTHORISED',
      Date: '/Date(1773446400000+0000)/',
      DateString: '2026-03-14T00:00:00',
    },
    { Type: 'ACCREC', Status: 'VOIDED', DateString: '2026-03-14T00:00:00' },
    { Type: 'ACCREC', Status: 'DELETED', DateString: '2026-03-14T00:00:00' },
    { Type: 'ACCPAY', Status: 'PAID', DateString: '2026-03-14T00:00:00' },
  ],
  // Payments carry only the /Date()/ form.
  payments: [
    { Status: 'AUTHORISED', Date: '/Date(1773446400000+0000)/' },
    { Status: 'DELETED', Date: '/Date(1773446400000+0000)/' },
  ],
  quotes: [{ Status: 'SENT', Date: '/Date(1773532800000)/', DateString: '2026-03-15T00:00:00' }],
  creditNotes: [{ Status: 'AUTHORISED', DateString: '2026-03-15T00:00:00' }],
};

describe('xero activity', () => {
  it('maps documents to events, dropping deleted ones', () => {
    const days = aggregateActivity(xeroActivityEvents(sources), '2026-03-14', '2026-03-15');
    expect(days).toEqual([
      { date: '2026-03-14', sales: 2, purchases: 1, payments: 1, quotes: 0, creditNotes: 0 },
      { date: '2026-03-15', sales: 0, purchases: 0, payments: 0, quotes: 1, creditNotes: 1 },
    ]);
  });
});
