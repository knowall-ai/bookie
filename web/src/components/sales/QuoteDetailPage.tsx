import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { QuoteStatusChange } from '@/lib/connectors/types';
import { formatDate, todayIso } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import {
  baseTotalRows,
  currencyFacts,
  DocumentFacts,
  DocumentLines,
  DocumentTotals,
} from '@/components/documents/DocumentParts';
import { AttachmentsCard } from '@/components/attachments/AttachmentsCard';
import { QuoteActions } from './QuoteActions';

/** Which status changes make sense from each status (the back end may allow fewer). */
const NEXT: Record<string, QuoteStatusChange[]> = {
  draft: ['sent', 'deleted'],
  sent: ['accepted', 'declined', 'deleted'],
  accepted: [],
  declined: ['sent'],
};

export async function QuoteDetailPage({ orgParam, id }: { orgParam: string; id: string }) {
  const { connector, base, org } = await orgContext(orgParam);
  const mod = connector.quotes;
  if (!mod) notFound();
  const quote = await mod.get(decodeURIComponent(id)).catch((error) => {
    if (isConnectorError(error) && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  });
  if (quote.status === 'deleted') notFound();
  const baseCurrency = (await connector.organisation().catch(() => undefined))?.baseCurrency;

  const listPath = `${base}/sales/quotes`;
  const allowed = (change: QuoteStatusChange) =>
    !!mod.setStatus &&
    (NEXT[quote.status] ?? []).includes(change) &&
    (!mod.statusChanges || mod.statusChanges.includes(change));
  const editable = (quote.status === 'draft' || quote.status === 'sent') && !!mod.update;
  const expired =
    (quote.status === 'sent' || quote.status === 'draft') &&
    !!quote.expiryDate &&
    quote.expiryDate < todayIso();

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Sales', href: `${base}/sales` },
          { label: 'Quotes', href: listPath },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Quote {quote.number}
            <StatusBadge status={quote.status} />
          </span>
        }
        meta={quote.title}
        actions={
          <>
            <QuoteActions
              orgKey={org.key}
              id={quote.id}
              listPath={listPath}
              invoicesPath={`${base}/sales/invoices`}
              editHref={editable ? `${listPath}/${encodeURIComponent(quote.id)}/edit` : undefined}
              pdfHref={
                mod.pdf
                  ? `/api/orgs/${encodeURIComponent(org.key)}/quotes/${encodeURIComponent(quote.id)}/pdf`
                  : undefined
              }
              can={{
                sent: allowed('sent'),
                accepted: allowed('accepted'),
                declined: allowed('declined'),
                deleted: allowed('deleted'),
                convert:
                  !!mod.convertToInvoice &&
                  !!connector.invoices &&
                  (mod.convertibleStatuses ?? ['accepted']).includes(quote.status),
              }}
            />
            {quote.sourceUrl && (
              <ButtonLink href={quote.sourceUrl} variant="ghost" size="sm">
                Open in {sourceName(org)} <ExternalLink className="h-3.5 w-3.5" />
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="space-y-5">
        <DocumentFacts
          facts={[
            { label: 'To', value: quote.contact.name },
            { label: 'Date', value: formatDate(quote.date) },
            {
              label: 'Expiry',
              value: (
                <span className={expired ? 'text-danger font-semibold' : undefined}>
                  {formatDate(quote.expiryDate)}
                  {expired ? ' · expired' : ''}
                </span>
              ),
            },
            { label: 'Quote number', value: quote.number || '—' },
            { label: 'Reference', value: quote.reference || '—' },
            ...currencyFacts(quote, baseCurrency, sourceName(org)),
          ]}
        />

        {quote.summary && (
          <div className="card p-5">
            <h2 className="text-faint text-xs font-semibold tracking-wide uppercase">Summary</h2>
            <p className="text-body mt-1 text-sm whitespace-pre-line">{quote.summary}</p>
          </div>
        )}

        <DocumentLines lines={quote.lineItems ?? []} currency={quote.currency} />

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 space-y-5">
            {quote.terms && (
              <div className="card p-5">
                <h2 className="text-ink mb-2 text-sm font-semibold">Terms</h2>
                <p className="text-muted text-sm whitespace-pre-line">{quote.terms}</p>
              </div>
            )}
            <AttachmentsCard connector={connector} org={org} entity="quote" id={quote.id} />
          </div>
          <DocumentTotals
            currency={quote.currency}
            rows={[
              { label: 'Subtotal', amount: quote.subTotal },
              {
                label: quote.lineAmountType === 'inclusive' ? 'Includes tax' : 'Total tax',
                amount: quote.totalTax,
                muted: true,
              },
              { label: 'Total', amount: quote.total, strong: true },
              ...baseTotalRows(quote, baseCurrency),
            ]}
          />
        </div>
      </div>
    </>
  );
}
