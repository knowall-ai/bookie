import 'server-only';
import type { AccountingConnector } from '@/lib/connectors/types';
import type { DocumentBucket, Invoice, InvoiceType } from '@/lib/domain/types';

export interface InvoiceOverview {
  draft: DocumentBucket;
  awaitingApproval: DocumentBucket;
  awaitingPayment: DocumentBucket;
  overdue: DocumentBucket;
  recent: Invoice[];
  /** True when a bucket hit the fetch cap, so its figures are a floor. */
  truncated: boolean;
}

const CAP = 500;

const sum = (invoices: Invoice[], pick: (i: Invoice) => number): DocumentBucket => ({
  count: invoices.length,
  total: Math.round(invoices.reduce((s, i) => s + pick(i), 0) * 100) / 100,
});

/** Xero's Sales/Purchases overview cards, from the open invoices or bills. */
export async function invoiceOverview(
  connector: AccountingConnector,
  type: InvoiceType
): Promise<InvoiceOverview | undefined> {
  const mod = connector.invoices;
  if (!mod) return undefined;
  const list = (status?: string, pageSize = CAP) => mod.list(type, { status, pageSize });
  const [draft, submitted, authorised, recent] = await Promise.all([
    list('draft'),
    list('submitted'),
    list('authorised'),
    list(undefined, 8),
  ]);
  const overdue = authorised.items.filter((i) => i.isOverdue);
  return {
    draft: sum(draft.items, (i) => i.total),
    awaitingApproval: sum(submitted.items, (i) => i.total),
    awaitingPayment: sum(authorised.items, (i) => i.amountDue),
    overdue: sum(overdue, (i) => i.amountDue),
    recent: recent.items,
    truncated: draft.hasMore || submitted.hasMore || authorised.hasMore,
  };
}
