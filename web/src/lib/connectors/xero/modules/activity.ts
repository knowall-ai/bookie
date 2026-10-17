import type { ActivityDay, IsoDate } from '@/lib/domain/types';
import { aggregateActivity, type ActivityEvent } from '@/lib/domain/activity';
import { xeroDate, type XeroClient } from '../client';

/** The few fields the activity chart needs from each Xero document. */
interface XeroDated {
  Date?: string;
  DateString?: string;
  Status?: string;
}
export interface XeroActivityInvoice extends XeroDated {
  Type?: 'ACCREC' | 'ACCPAY' | string;
}
export type XeroActivityPayment = XeroDated;
export type XeroActivityQuote = XeroDated;
export type XeroActivityCreditNote = XeroDated;

export interface XeroActivitySources {
  invoices: XeroActivityInvoice[];
  payments: XeroActivityPayment[];
  quotes: XeroActivityQuote[];
  creditNotes: XeroActivityCreditNote[];
}

const date = (d: XeroDated) => (d.DateString ? d.DateString.slice(0, 10) : xeroDate(d.Date));
/** Deleted drafts were never raised; voided documents were, so they still count. */
const live = (d: XeroDated) => d.Status !== 'DELETED';

/** Raw Xero documents to activity events. Exported for tests. */
export function xeroActivityEvents(sources: XeroActivitySources): ActivityEvent[] {
  return [
    ...sources.invoices.filter(live).map((i): ActivityEvent => ({
      date: date(i),
      kind: i.Type === 'ACCPAY' ? 'purchases' : 'sales',
    })),
    ...sources.payments
      .filter(live)
      .map((p): ActivityEvent => ({ date: date(p), kind: 'payments' })),
    ...sources.quotes.filter(live).map((q): ActivityEvent => ({ date: date(q), kind: 'quotes' })),
    ...sources.creditNotes
      .filter(live)
      .map((c): ActivityEvent => ({ date: date(c), kind: 'creditNotes' })),
  ];
}

const xeroDateTime = (iso: IsoDate) => `DateTime(${iso.replaceAll('-', ',')})`;

/** Most pages we follow per endpoint (Xero allows 60 calls a minute per org). */
const MAX_PAGES = 10;

async function allPages<T>(
  client: XeroClient,
  path: string,
  key: string,
  query: Record<string, string | number | boolean | undefined>,
  pageSize: number
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await client.request<Record<string, unknown>>(path, {
      query: { ...query, page },
    });
    const batch = (result[key] as T[] | undefined) ?? [];
    items.push(...batch);
    const pageCount = (result.pagination as { pageCount?: number } | undefined)?.pageCount;
    if (batch.length < pageSize || (pageCount !== undefined && page >= pageCount)) break;
  }
  return items;
}

/**
 * Four list calls (more only for very busy orgs), all date-filtered at Xero:
 * invoices and bills together, payments, quotes and credit notes.
 */
export function xeroActivity(client: XeroClient) {
  return async (from: IsoDate, to: IsoDate): Promise<ActivityDay[]> => {
    const where = `Date>=${xeroDateTime(from)} AND Date<=${xeroDateTime(to)}`;
    const [invoices, payments, quotes, creditNotes] = await Promise.all([
      allPages<XeroActivityInvoice>(
        client,
        'Invoices',
        'Invoices',
        { where, summaryOnly: true, pageSize: 1000 },
        1000
      ),
      allPages<XeroActivityPayment>(
        client,
        'Payments',
        'Payments',
        { where, pageSize: 1000 },
        1000
      ),
      // Quotes page at 100 and filter with DateFrom/DateTo rather than `where`.
      allPages<XeroActivityQuote>(client, 'Quotes', 'Quotes', { DateFrom: from, DateTo: to }, 100),
      allPages<XeroActivityCreditNote>(
        client,
        'CreditNotes',
        'CreditNotes',
        { where, pageSize: 1000 },
        1000
      ),
    ]);
    return aggregateActivity(
      xeroActivityEvents({ invoices, payments, quotes, creditNotes }),
      from,
      to
    );
  };
}
