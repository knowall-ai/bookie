import type { ActivityDay, IsoDate } from '@/lib/domain/types';
import { aggregateActivity, type ActivityEvent } from '@/lib/domain/activity';
import { isConnectorError } from '../../types';
import type { BcClient } from '../client';

export interface BcActivitySources {
  salesInvoices: { invoiceDate?: string }[];
  purchaseInvoices: { invoiceDate?: string }[];
  salesQuotes: { documentDate?: string }[];
  salesCreditMemos: { creditMemoDate?: string }[];
  purchaseCreditMemos: { creditMemoDate?: string }[];
  /** Posted G/L lines with document type Payment (several lines per payment). */
  paymentEntries: { postingDate?: string; documentNumber?: string }[];
}

/** Raw BC rows to activity events. Exported for tests. */
export function bcActivityEvents(sources: BcActivitySources): ActivityEvent[] {
  // A posted payment writes at least two G/L lines (bank and receivable or payable),
  // so count each document number once per posting date.
  const payments = new Set(
    sources.paymentEntries
      .filter((e) => e.postingDate)
      .map((e) => `${e.postingDate!.slice(0, 10)}|${e.documentNumber ?? ''}`)
  );
  return [
    ...sources.salesInvoices.map((i): ActivityEvent => ({ date: i.invoiceDate, kind: 'sales' })),
    ...sources.purchaseInvoices.map((i): ActivityEvent => ({
      date: i.invoiceDate,
      kind: 'purchases',
    })),
    ...sources.salesQuotes.map((q): ActivityEvent => ({ date: q.documentDate, kind: 'quotes' })),
    ...[...sources.salesCreditMemos, ...sources.purchaseCreditMemos].map((c): ActivityEvent => ({
      date: c.creditMemoDate,
      kind: 'creditNotes',
    })),
    ...[...payments].map((key): ActivityEvent => ({ date: key.slice(0, 10), kind: 'payments' })),
  ];
}

/**
 * Six date-filtered reads, each selecting only the date column. BC's API v2.0
 * has no posted-payments entity (customerPayments are unposted journal lines),
 * so payments come from G/L entries with document type Payment.
 */
export function bcActivity(client: BcClient) {
  return async (from: IsoDate, to: IsoDate): Promise<ActivityDay[]> => {
    const range = (field: string) => `${field} ge ${from} and ${field} le ${to}`;
    const read = <T>(entity: string, field: string, extra?: string, select = field) =>
      client.all<T>(entity, {
        $select: select,
        $filter: extra ? `${range(field)} and ${extra}` : range(field),
      });
    const [
      salesInvoices,
      purchaseInvoices,
      salesQuotes,
      salesCreditMemos,
      purchaseCreditMemos,
      paymentEntries,
    ] = await Promise.all([
      read<{ invoiceDate?: string }>('salesInvoices', 'invoiceDate'),
      read<{ invoiceDate?: string }>('purchaseInvoices', 'invoiceDate'),
      read<{ documentDate?: string }>('salesQuotes', 'documentDate'),
      read<{ creditMemoDate?: string }>('salesCreditMemos', 'creditMemoDate'),
      // purchaseCreditMemos arrived in later BC versions; older ones answer 404.
      read<{ creditMemoDate?: string }>('purchaseCreditMemos', 'creditMemoDate').catch(
        (error: unknown) => {
          if (isConnectorError(error) && error.status === 404) return [];
          throw error;
        }
      ),
      read<{ postingDate?: string; documentNumber?: string }>(
        'generalLedgerEntries',
        'postingDate',
        "documentType eq 'Payment'",
        'postingDate,documentNumber'
      ),
    ]);
    return aggregateActivity(
      bcActivityEvents({
        salesInvoices,
        purchaseInvoices,
        salesQuotes,
        salesCreditMemos,
        purchaseCreditMemos,
        paymentEntries,
      }),
      from,
      to
    );
  };
}
