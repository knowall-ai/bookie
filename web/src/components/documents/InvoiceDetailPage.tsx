import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { InvoiceType } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { DocumentFacts, DocumentLines, DocumentTotals } from './DocumentParts';
import { InvoiceActions } from './InvoiceActions';

export async function InvoiceDetailPage({
  orgParam,
  id,
  type,
}: {
  orgParam: string;
  id: string;
  type: InvoiceType;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.invoices) notFound();
  const invoice = await connector.invoices.get(decodeURIComponent(id)).catch((error) => {
    if (isConnectorError(error) && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  });
  if (invoice.type !== type) notFound();

  const isSales = type === 'sales';
  const listPath = `${base}${isSales ? '/sales/invoices' : '/purchases/bills'}`;
  const noun = isSales ? 'Invoice' : 'Bill';
  const m = connector.invoices;
  const editable = (invoice.status === 'draft' || invoice.status === 'submitted') && !!m.update;

  return (
    <>
      <PageHeader
        crumbs={[
          {
            label: isSales ? 'Sales' : 'Purchases',
            href: `${base}${isSales ? '/sales' : '/purchases'}`,
          },
          { label: isSales ? 'Invoices' : 'Bills', href: listPath },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {noun} {invoice.number}
            <StatusBadge status={invoice.status} overdue={invoice.isOverdue} />
          </span>
        }
        actions={
          <>
            <InvoiceActions
              orgKey={org.key}
              id={invoice.id}
              noun={noun}
              listPath={listPath}
              editHref={editable ? `${listPath}/${encodeURIComponent(invoice.id)}/edit` : undefined}
              can={{
                approve:
                  (invoice.status === 'draft' || invoice.status === 'submitted') && !!m.approve,
                email: isSales && invoice.status === 'authorised' && !!m.email,
                void: invoice.status === 'authorised' && invoice.amountPaid === 0 && !!m.void,
                delete:
                  (invoice.status === 'draft' || invoice.status === 'submitted') && !!m.delete,
                pdf: !!m.pdf,
              }}
              pdfHref={`/api/orgs/${encodeURIComponent(org.key)}/invoices/${encodeURIComponent(invoice.id)}/pdf`}
            />
            {invoice.sourceUrl && (
              <ButtonLink href={invoice.sourceUrl} variant="ghost" size="sm">
                Open in {sourceName(org)} <ExternalLink className="h-3.5 w-3.5" />
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="space-y-5">
        <DocumentFacts
          facts={[
            { label: isSales ? 'To' : 'From', value: invoice.contact.name },
            { label: 'Date', value: formatDate(invoice.date) },
            {
              label: 'Due date',
              value: (
                <span className={invoice.isOverdue ? 'text-danger font-semibold' : undefined}>
                  {formatDate(invoice.dueDate)}
                </span>
              ),
            },
            {
              label: isSales ? 'Invoice number' : 'Reference',
              value: (isSales ? invoice.number : invoice.reference) || '—',
            },
            {
              label: isSales ? 'Reference' : 'Number',
              value: (isSales ? invoice.reference : invoice.number) || '—',
            },
          ]}
        />

        <DocumentLines lines={invoice.lineItems ?? []} currency={invoice.currency} />

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            {invoice.payments && invoice.payments.length > 0 && (
              <div className="card p-5">
                <h2 className="text-ink mb-3 text-sm font-semibold">Payments</h2>
                <ul className="space-y-2 text-sm">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <span className="text-muted">
                        {formatDate(p.date)}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </span>
                      <Money amount={p.amount} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DocumentTotals
            currency={invoice.currency}
            rows={[
              { label: 'Subtotal', amount: invoice.subTotal },
              {
                label: invoice.lineAmountType === 'inclusive' ? 'Includes tax' : 'Total tax',
                amount: invoice.totalTax,
                muted: true,
              },
              { label: 'Total', amount: invoice.total, strong: true },
              ...(invoice.amountPaid
                ? [{ label: 'Less payments', amount: -invoice.amountPaid, muted: true }]
                : []),
              ...(invoice.amountCredited
                ? [{ label: 'Less credit', amount: -invoice.amountCredited, muted: true }]
                : []),
              { label: 'Amount due', amount: invoice.amountDue, strong: true },
            ]}
          />
        </div>
      </div>
    </>
  );
}
