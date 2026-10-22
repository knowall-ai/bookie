import type { Invoice } from '@/lib/domain/types';

export type InvoiceActionName = 'approve' | 'void' | 'delete' | 'email';

/**
 * Whether an action is allowed on the invoice as it is now. The same rules the invoice page
 * uses to offer the buttons, re-checked on the server against the live record, so a stale
 * button (a Bookie suggestion card, an old tab) can't email a voided invoice.
 */
export function invoiceActionBlocked(
  invoice: Pick<Invoice, 'type' | 'status' | 'amountPaid'>,
  action: InvoiceActionName
): string | undefined {
  const noun = invoice.type === 'sales' ? 'invoice' : 'bill';
  switch (action) {
    case 'approve':
    case 'delete':
      return invoice.status === 'draft' || invoice.status === 'submitted'
        ? undefined
        : `This ${noun} is ${invoice.status}, so it can't be ${action === 'approve' ? 'approved' : 'deleted'}.`;
    case 'email':
      if (invoice.type !== 'sales') return 'Only sales invoices can be emailed.';
      return invoice.status === 'authorised'
        ? undefined
        : `This invoice is ${invoice.status}; only approved invoices can be emailed.`;
    case 'void':
      if (invoice.status !== 'authorised')
        return `This ${noun} is ${invoice.status}, so it can't be voided.`;
      return invoice.amountPaid === 0
        ? undefined
        : `This ${noun} has payments or the source doesn't say it has none, so it can't be voided.`;
  }
}
