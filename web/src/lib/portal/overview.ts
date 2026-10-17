import 'server-only';
import type { AccountingConnector } from '@/lib/connectors/types';
import { bucketOf } from '@/lib/connectors/buckets';
import type { DocumentBucket, Invoice, InvoiceType } from '@/lib/domain/types';

export interface InvoiceOverview {
  draft: DocumentBucket;
  awaitingApproval: DocumentBucket;
  awaitingPayment: DocumentBucket;
  overdue: DocumentBucket;
  recent: Invoice[];
  /** True when a bucket hit the fetch cap, so its figures are a floor. */
  truncated: boolean;
  /** Why an amount is missing (the list's source note), if any is. */
  note?: string;
}

const CAP = 500;

/**
 * Xero's Sales/Purchases overview cards, from the open invoices or bills.
 * Amounts the source doesn't report are counted, never summed, and other
 * currencies are totalled separately, never converted (see `bucketOf`).
 */
export async function invoiceOverview(
  connector: AccountingConnector,
  type: InvoiceType
): Promise<InvoiceOverview | undefined> {
  const mod = connector.invoices;
  if (!mod) return undefined;
  const list = (status?: string, pageSize = CAP) => mod.list(type, { status, pageSize });
  const [draft, submitted, authorised, recent, details] = await Promise.all([
    list('draft'),
    list('submitted'),
    list('authorised'),
    list(undefined, 8),
    connector.organisation(),
  ]);
  const base = details.baseCurrency ?? '';
  const of = (items: Invoice[], pick: (i: Invoice) => number | undefined) =>
    bucketOf(
      items.map((i) => ({ amount: pick(i), currency: i.currency })),
      base
    );
  const overdue = authorised.items.filter((i) => i.isOverdue);
  return {
    draft: of(draft.items, (i) => i.total),
    awaitingApproval: of(submitted.items, (i) => i.total),
    awaitingPayment: of(authorised.items, (i) => i.amountDue),
    overdue: of(overdue, (i) => i.amountDue),
    recent: recent.items,
    truncated: draft.hasMore || submitted.hasMore || authorised.hasMore,
    note: authorised.note,
  };
}
