import type { DashboardSummary, DocumentBucket, Invoice } from '@/lib/domain/types';

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Sum documents into a dashboard bucket without guessing:
 * - an amount the source doesn't report is counted, never summed as 0 or as
 *   the full total (`unknownCount`, and `total` is then undefined);
 * - documents in another currency are never added to base-currency ones or
 *   converted at a made-up rate: the bucket lists a total per currency instead.
 *
 * `currency` '' means "the base currency" (BC leaves LCY documents blank).
 */
export function bucketOf(
  items: { amount: number | undefined; currency: string }[],
  base: string
): DocumentBucket {
  const sums = new Map<string, number>();
  let unknown = 0;
  for (const item of items) {
    if (item.amount === undefined) {
      unknown++;
      continue;
    }
    const currency = item.currency || base;
    sums.set(currency, round((sums.get(currency) ?? 0) + item.amount));
  }
  const currencies = [...sums.keys()];
  const singleCurrency = currencies.every((c) => c === base);
  return {
    count: items.length,
    total: unknown || !singleCurrency ? undefined : (sums.get(base) ?? 0),
    ...(singleCurrency
      ? {}
      : {
          byCurrency: currencies
            .sort((a, b) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)))
            .map((currency) => ({ currency, total: sums.get(currency)! })),
        }),
    ...(unknown ? { unknownCount: unknown } : {}),
  };
}

/**
 * Xero-style "owed to you" / "to pay" buckets from unpaid invoices: drafts and
 * awaiting approval at their total, awaiting payment and overdue at the amount due.
 */
export function invoiceBuckets(invoices: Invoice[], base: string): DashboardSummary['receivables'] {
  const of = (list: Invoice[], amount: (i: Invoice) => number | undefined) =>
    bucketOf(
      list.map((i) => ({ amount: amount(i), currency: i.currency })),
      base
    );
  const authorised = invoices.filter((i) => i.status === 'authorised');
  return {
    draft: of(
      invoices.filter((i) => i.status === 'draft'),
      (i) => i.total
    ),
    awaitingApproval: of(
      invoices.filter((i) => i.status === 'submitted'),
      (i) => i.total
    ),
    awaitingPayment: of(authorised, (i) => i.amountDue),
    overdue: of(
      authorised.filter((i) => i.isOverdue),
      (i) => i.amountDue
    ),
  };
}
