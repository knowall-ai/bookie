import { describe, expect, it } from 'vitest';
import { aggregateActivity } from '@/lib/domain/activity';
import { bcActivityEvents } from './activity';

// Shaped like BC API v2.0 rows with `$select` of the date column only.
describe('bc activity', () => {
  it('maps documents and counts each posted payment once', () => {
    const events = bcActivityEvents({
      salesInvoices: [{ invoiceDate: '2026-03-14' }, { invoiceDate: '2026-03-14' }],
      purchaseInvoices: [{ invoiceDate: '2026-03-15' }],
      salesQuotes: [{ documentDate: '2026-03-15' }],
      salesCreditMemos: [{ creditMemoDate: '2026-03-14' }],
      purchaseCreditMemos: [{ creditMemoDate: '2026-03-15' }],
      paymentEntries: [
        // One customer payment: bank line and receivable line.
        { postingDate: '2026-03-14', documentNumber: 'PAY-0001' },
        { postingDate: '2026-03-14', documentNumber: 'PAY-0001' },
        { postingDate: '2026-03-14', documentNumber: 'PAY-0002' },
        { postingDate: '2026-03-15', documentNumber: 'PAY-0001' },
      ],
    });
    expect(aggregateActivity(events, '2026-03-14', '2026-03-15')).toEqual([
      { date: '2026-03-14', sales: 2, purchases: 0, payments: 2, quotes: 0, creditNotes: 1 },
      { date: '2026-03-15', sales: 0, purchases: 1, payments: 1, quotes: 1, creditNotes: 1 },
    ]);
  });
});
