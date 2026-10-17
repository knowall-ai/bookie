import 'server-only';
import type { AccountingConnector } from '@/lib/connectors/types';
import type { DocumentBucket, Invoice, InvoiceType } from '@/lib/domain/types';
import { sumInBase } from '@/lib/domain/currency';

export interface InvoiceOverview {
  draft: DocumentBucket;
  awaitingApproval: DocumentBucket;
  awaitingPayment: DocumentBucket;
  overdue: DocumentBucket;
  recent: Invoice[];
  /** True when a bucket hit the fetch cap, so its figures are a floor. */
  truncated: boolean;
  /** Foreign-currency documents left out of the base-currency totals (no source rate). */
  excluded: number;
  excludedCurrencies: string[];
}

const CAP = 500;

/**
 * Xero's Sales/Purchases overview cards, from the open invoices or bills, in
 * the base currency: foreign documents convert at their own source rate
 * (Xero CurrencyRate) and are left out, and counted, when there is none.
 */
export async function invoiceOverview(
  connector: AccountingConnector,
  type: InvoiceType,
  baseCurrency: string
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
  const parts = {
    draft: sumInBase(draft.items, (i) => i.total, baseCurrency),
    awaitingApproval: sumInBase(submitted.items, (i) => i.total, baseCurrency),
    awaitingPayment: sumInBase(authorised.items, (i) => i.amountDue, baseCurrency),
    overdue: sumInBase(overdue, (i) => i.amountDue, baseCurrency),
  };
  const bucket = ({ count, total }: DocumentBucket): DocumentBucket => ({ count, total });
  const open = [parts.draft, parts.awaitingApproval, parts.awaitingPayment];
  return {
    draft: bucket(parts.draft),
    awaitingApproval: bucket(parts.awaitingApproval),
    awaitingPayment: bucket(parts.awaitingPayment),
    overdue: bucket(parts.overdue),
    recent: recent.items,
    truncated: draft.hasMore || submitted.hasMore || authorised.hasMore,
    excluded: open.reduce((n, p) => n + p.excluded, 0),
    excludedCurrencies: [...new Set(open.flatMap((p) => p.excludedCurrencies))].sort(),
  };
}
