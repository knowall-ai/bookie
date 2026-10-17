import Link from 'next/link';
import { Suspense } from 'react';
import { FileText } from 'lucide-react';
import type { AccountingConnector } from '@/lib/connectors/types';
import { formatDate } from '@/lib/ui/format';
import { Money } from '@/components/ui/Money';
import { StatusBadge } from '@/components/ui/Badge';

/**
 * Invoices raised from an invoiced quote. Bookie's "Create invoice" puts the
 * quote number in the invoice reference, so these are the sales invoices
 * whose reference is exactly the quote number (none shown if it was changed).
 */
export function QuoteInvoices(props: {
  connector: AccountingConnector;
  base: string;
  quoteNumber: string;
  contactId: string;
}) {
  if (!props.connector.invoices || !props.quoteNumber) return null;
  return (
    <Suspense fallback={null}>
      <QuoteInvoicesInner {...props} />
    </Suspense>
  );
}

async function QuoteInvoicesInner({
  connector,
  base,
  quoteNumber,
  contactId,
}: {
  connector: AccountingConnector;
  base: string;
  quoteNumber: string;
  contactId: string;
}) {
  const page = await connector
    .invoices!.list('sales', { search: quoteNumber, contactId, pageSize: 20 })
    .catch(() => undefined);
  const invoices = (page?.items ?? []).filter((i) => i.reference?.trim() === quoteNumber);
  if (invoices.length === 0) return null;
  return (
    <section aria-labelledby="quote-invoices" className="card p-5" data-testid="quote-invoices">
      <h2
        id="quote-invoices"
        className="text-ink mb-3 flex items-center gap-2 text-sm font-semibold"
      >
        <FileText className="text-faint h-4 w-4" />
        {invoices.length === 1 ? 'Invoice' : 'Invoices'} from this quote
      </h2>
      <ul className="space-y-2 text-sm">
        {invoices.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`${base}/sales/invoices/${encodeURIComponent(i.id)}`}
              className="text-brand-bright font-medium hover:underline"
            >
              {i.number || 'Draft invoice'}
            </Link>
            <span className="text-muted">{formatDate(i.date)}</span>
            <Money amount={i.total} currency={i.currency} className="text-ink" />
            <StatusBadge status={i.status} overdue={i.isOverdue} />
          </li>
        ))}
      </ul>
    </section>
  );
}
