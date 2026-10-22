import { describe, expect, it } from 'vitest';
import { invoiceActionBlocked } from './invoice-rules';

const sales = (status: string, amountPaid?: number) =>
  ({ type: 'sales', status, amountPaid }) as Parameters<typeof invoiceActionBlocked>[0];

describe('invoiceActionBlocked', () => {
  it('lets a stale Email button through only while the invoice is still approved', () => {
    expect(invoiceActionBlocked(sales('authorised'), 'email')).toBeUndefined();
    expect(invoiceActionBlocked(sales('voided'), 'email')).toMatch(/voided/);
    expect(invoiceActionBlocked(sales('paid'), 'email')).toMatch(/paid/);
    expect(invoiceActionBlocked({ type: 'purchase', status: 'authorised' }, 'email')).toMatch(
      /Only sales invoices/
    );
  });

  it('approves and deletes only drafts and submitted documents', () => {
    expect(invoiceActionBlocked(sales('draft'), 'approve')).toBeUndefined();
    expect(invoiceActionBlocked(sales('submitted'), 'delete')).toBeUndefined();
    expect(invoiceActionBlocked(sales('authorised'), 'approve')).toMatch(/can't be approved/);
  });

  it('voids only when the source confirms nothing has been paid', () => {
    expect(invoiceActionBlocked(sales('authorised', 0), 'void')).toBeUndefined();
    expect(invoiceActionBlocked(sales('authorised', 50), 'void')).toMatch(/can't be voided/);
    expect(invoiceActionBlocked(sales('authorised', undefined), 'void')).toMatch(/can't be voided/);
  });
});
