import 'server-only';
import type { AccountingConnector } from '@/lib/connectors/types';
import type {
  BankAccount,
  BankTransaction,
  Invoice,
  InvoiceType,
  IsoDate,
} from '@/lib/domain/types';
import type { BankLine } from '@/lib/reconcile/match';

/** Open documents compared per direction (the newest; Find & match searches the rest). */
export const CANDIDATE_LIMIT = 100;

const shift = (iso: IsoDate, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Open invoices (money in) or bills (money out), live from the source. */
export async function openDocuments(
  connector: AccountingConnector,
  type: InvoiceType,
  search?: string
): Promise<{ items: Invoice[]; hasMore: boolean }> {
  if (!connector.invoices) return { items: [], hasMore: false };
  const page = await connector.invoices.list(type, {
    status: 'authorised',
    pageSize: CANDIDATE_LIMIT,
    search: search || undefined,
  });
  return { items: page.items, hasMore: page.hasMore };
}

/**
 * Unreconciled entries already in the books around the lines' dates, for
 * "payment already recorded". Undefined when the register can't be read, so
 * the caller can say so instead of assuming there are none.
 */
export async function unreconciledEntries(
  connector: AccountingConnector,
  account: BankAccount,
  lines: BankLine[]
): Promise<BankTransaction[] | undefined> {
  const bank = connector.bank;
  if (!bank || lines.length === 0) return [];
  const dates = lines.map((l) => l.date).sort();
  try {
    const page = await bank.transactions(account.id, {
      from: shift(dates[0], -7),
      to: shift(dates[dates.length - 1], 7),
      reconciled: bank.filters?.reconciled ? false : undefined,
      pageSize: 200,
    });
    // A source that can't list transactions explains why in `note` and returns nothing.
    if (page.note && page.items.length === 0) return undefined;
    return page.items.filter((t) => !t.isReconciled && t.status === 'authorised');
  } catch {
    return undefined;
  }
}

/** Whether Bookie can record a payment on this kind of document here. */
export function canPay(connector: AccountingConnector, type: InvoiceType): boolean {
  const payments = connector.payments;
  return (
    !!connector.invoices &&
    !!payments?.create &&
    (!payments.createFor || payments.createFor.includes(type))
  );
}
