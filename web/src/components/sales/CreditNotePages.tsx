import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, FileMinus, Info, Plus } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { CreditNote, CreditNoteType } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusTabs } from '@/components/ui/StatusTabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { StatusBadge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/ui/SearchBox';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, NotAvailable } from '@/components/ui/States';
import {
  baseTotalRows,
  currencyFacts,
  DocumentFacts,
  DocumentLines,
  DocumentTotals,
} from '@/components/documents/DocumentParts';
import type { ListSearchParams } from '@/components/documents/InvoiceListPage';
import { SourceNote } from '@/components/accounting/SourceNote';
import { HistoryPanel } from '@/components/history/HistoryPanel';
import { CreditNoteActions } from './CreditNoteActions';
import { AllocateCreditPanel, type AllocatableDocument } from './AllocateCreditPanel';

export const CREDIT_NOTE_COPY = {
  sales: {
    title: 'Credit notes',
    section: 'Sales',
    sectionPath: '/sales',
    path: '/sales/credit-notes',
    party: 'To',
    noun: 'credit notes',
    newLabel: 'New credit note',
    docNoun: 'invoice',
    docPath: '/sales/invoices',
  },
  purchase: {
    title: 'Supplier credit notes',
    section: 'Purchases',
    sectionPath: '/purchases',
    path: '/purchases/credit-notes',
    party: 'From',
    noun: 'supplier credit notes',
    newLabel: 'New supplier credit note',
    docNoun: 'bill',
    docPath: '/purchases/bills',
  },
} as const;

const COPY = CREDIT_NOTE_COPY;

export async function CreditNoteListPage({
  orgParam,
  type,
  searchParams,
}: {
  orgParam: string;
  type: CreditNoteType;
  searchParams: ListSearchParams;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  const copy = COPY[type];
  const crumbs = [{ label: copy.section, href: `${base}${copy.sectionPath}` }];
  if (!connector.creditNotes) {
    return (
      <>
        <PageHeader title={copy.title} crumbs={crumbs} />
        <NotAvailable feature="Credit notes" source={sourceName(org)} />
      </>
    );
  }
  const status = searchParams.status ?? 'all';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const result = await connector.creditNotes.list(type, {
    status,
    search: searchParams.search,
    page,
    pageSize: 50,
  });
  const listPath = `${base}${copy.path}`;

  const columns: Column<CreditNote>[] = [
    {
      key: 'number',
      header: 'Number',
      cell: (c) => <span className="text-ink font-medium">{c.number || '—'}</span>,
    },
    {
      key: 'ref',
      header: 'Ref',
      cell: (c) => <span className="text-muted">{c.reference ?? ''}</span>,
      hideOnMobile: true,
    },
    {
      key: 'contact',
      header: copy.party,
      cell: (c) => <span className="text-ink">{c.contact.name}</span>,
    },
    { key: 'date', header: 'Date', cell: (c) => formatDate(c.date) },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (c) => <Money amount={c.total} />,
      hideOnMobile: true,
    },
    {
      key: 'remaining',
      header: 'Remaining credit',
      align: 'right',
      cell: (c) => (
        <Money
          amount={c.remainingCredit}
          currency={c.currency}
          className="text-ink"
          missing={result.note}
        />
      ),
    },
    { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
  ];

  const canCreate = !!connector.creditNotes.create;
  const newButton = canCreate && (
    <ButtonLink href={`${listPath}/new`} variant="primary">
      <Plus className="h-4 w-4" /> {copy.newLabel}
    </ButtonLink>
  );

  return (
    <>
      <PageHeader title={copy.title} crumbs={crumbs} actions={newButton} />
      <StatusTabs
        basePath={listPath}
        current={status}
        params={{ search: searchParams.search }}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'draft', label: 'Draft' },
          { value: 'submitted', label: 'Awaiting approval' },
          { value: 'authorised', label: 'Awaiting payment' },
          { value: 'paid', label: 'Paid' },
          { value: 'voided', label: 'Voided' },
        ]}
      />
      <SourceNote>{result.note}</SourceNote>
      <div className="mb-4 flex items-center gap-3">
        <SearchBox
          placeholder={`Search ${copy.noun} by number, reference or contact`}
          className="w-full max-w-md"
        />
      </div>
      <DataTable
        columns={columns}
        rows={result.items}
        rowKey={(c) => c.id}
        rowHref={(c) => `${listPath}/${encodeURIComponent(c.id)}`}
        empty={
          <EmptyState
            icon={<FileMinus className="h-6 w-6" />}
            title={
              searchParams.search
                ? `No ${copy.noun} match “${searchParams.search}”`
                : `No ${copy.noun} here`
            }
            body={
              !searchParams.search && status === 'all' && !canCreate
                ? `Credit notes are raised in ${sourceName(org)} against an invoice or bill, and appear here.`
                : undefined
            }
            action={!searchParams.search && newButton}
          />
        }
      />
      <Pagination
        page={result.page}
        hasMore={result.hasMore}
        basePath={listPath}
        params={{ status: searchParams.status, search: searchParams.search }}
      />
    </>
  );
}

export async function CreditNoteDetailPage({
  orgParam,
  id,
  type,
  allocateTo,
}: {
  orgParam: string;
  id: string;
  type: CreditNoteType;
  /** Invoice or bill id to preselect in the Allocate credit panel (`?allocate=`). */
  allocateTo?: string;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  const mod = connector.creditNotes;
  if (!mod) notFound();
  const note = await mod.get(decodeURIComponent(id)).catch((error) => {
    if (isConnectorError(error) && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  });
  if (note.type !== type || note.status === 'deleted') notFound();
  const baseCurrency = (await connector.organisation().catch(() => undefined))?.baseCurrency;
  const copy = COPY[type];
  const listPath = `${base}${copy.path}`;
  const source = sourceName(org);
  const isDraft = note.status === 'draft' || note.status === 'submitted';
  const allocations = note.allocations ?? [];
  const allocatedTotal = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  const remaining = note.remainingCredit;
  const canAllocate =
    note.status === 'authorised' && !!mod.allocate && remaining !== undefined && remaining > 0;

  // Outstanding documents for the same contact and currency, for the Allocate panel.
  const documents: AllocatableDocument[] =
    canAllocate && connector.invoices
      ? (
          await connector.invoices
            .list(type, { contactId: note.contact.id, status: 'authorised', pageSize: 100 })
            .catch(() => ({ items: [] }))
        ).items
          .filter(
            (i) =>
              i.contact.id === note.contact.id &&
              i.currency === note.currency &&
              typeof i.amountDue === 'number' &&
              i.amountDue > 0
          )
          .map((i) => ({
            id: i.id,
            number: i.number,
            date: i.date,
            dueDate: i.dueDate,
            amountDue: i.amountDue!,
          }))
      : [];

  return (
    <>
      <PageHeader
        crumbs={[
          { label: copy.section, href: `${base}${copy.sectionPath}` },
          { label: copy.title, href: listPath },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Credit note {note.number}
            <StatusBadge status={note.status} />
          </span>
        }
        actions={
          <>
            <CreditNoteActions
              orgKey={org.key}
              id={note.id}
              listPath={listPath}
              editHref={
                isDraft && mod.update
                  ? `${listPath}/${encodeURIComponent(note.id)}/edit`
                  : undefined
              }
              can={{
                approve: isDraft && !!mod.approve,
                void: note.status === 'authorised' && allocations.length === 0 && !!mod.void,
                delete: isDraft && !!mod.delete,
              }}
            />
            {note.sourceUrl && (
              <ButtonLink href={note.sourceUrl} variant="ghost" size="sm">
                Open in {source} <ExternalLink className="h-3.5 w-3.5" />
              </ButtonLink>
            )}
          </>
        }
      />
      <div className="space-y-5">
        <DocumentFacts
          facts={[
            { label: copy.party, value: note.contact.name },
            { label: 'Date', value: formatDate(note.date) },
            { label: 'Credit note number', value: note.number || '—' },
            { label: 'Reference', value: note.reference || '—' },
            ...(note.appliesTo
              ? [
                  {
                    label: `Applies to ${copy.docNoun}`,
                    value: note.appliesTo.id ? (
                      <Link
                        href={`${base}${copy.docPath}/${encodeURIComponent(note.appliesTo.id)}`}
                        className="text-brand-bright hover:underline"
                      >
                        {note.appliesTo.number}
                      </Link>
                    ) : (
                      note.appliesTo.number
                    ),
                  },
                ]
              : []),
            ...(currencyFacts(note, baseCurrency, source).length
              ? currencyFacts(note, baseCurrency, source)
              : [{ label: 'Currency', value: note.currency }]),
          ]}
        />
        <DocumentLines lines={note.lineItems ?? []} currency={note.currency} />
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-5">
            {canAllocate && (
              <AllocateCreditPanel
                key={remaining}
                orgKey={org.key}
                creditNoteId={note.id}
                creditNumber={note.number}
                remainingCredit={remaining}
                currency={note.currency}
                documents={documents}
                noun={copy.docNoun}
                preselect={allocateTo}
              />
            )}
            {note.status === 'authorised' && !mod.allocate && mod.allocationNote && (
              <p
                className="card text-muted flex items-start gap-2 p-5 text-sm"
                data-testid="allocation-note"
              >
                <Info className="text-faint mt-0.5 h-4 w-4 shrink-0" />
                {mod.allocationNote}
              </p>
            )}
            {allocations.length > 0 && (
              <section aria-labelledby="allocations-heading" className="card p-5">
                <h2 id="allocations-heading" className="text-ink mb-3 text-sm font-semibold">
                  Allocations
                </h2>
                <ul className="space-y-2 text-sm" data-testid="allocations">
                  {allocations.map((a, i) => (
                    <li key={a.id ?? i} className="flex justify-between gap-4">
                      <span className="text-muted">
                        {a.date ? `${formatDate(a.date)} · ` : ''}
                        <Link
                          href={`${base}${copy.docPath}/${encodeURIComponent(a.invoice.id)}`}
                          className="text-brand-bright hover:underline"
                        >
                          {a.invoice.number ?? `View ${copy.docNoun}`}
                        </Link>
                      </span>
                      <Money amount={a.amount} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <div className="ml-auto w-full max-w-sm space-y-2">
            <DocumentTotals
              currency={note.currency}
              rows={[
                { label: 'Subtotal', amount: note.subTotal },
                {
                  label: note.lineAmountType === 'inclusive' ? 'Includes tax' : 'Total tax',
                  amount: note.totalTax,
                  muted: true,
                },
                { label: 'Total', amount: note.total, strong: true },
                ...baseTotalRows(note, baseCurrency),
                ...(allocatedTotal > 0
                  ? [{ label: 'Less allocated', amount: -allocatedTotal, muted: true }]
                  : []),
                ...(remaining !== undefined
                  ? [{ label: 'Remaining credit', amount: remaining, strong: true }]
                  : []),
              ]}
            />
            {remaining === undefined && (
              <p className="text-muted flex justify-between gap-6 text-sm">
                <span>Remaining credit</span>
                <span className="text-faint">Not available from {source}</span>
              </p>
            )}
          </div>
        </div>

        <HistoryPanel
          connector={connector}
          orgKey={org.key}
          entity="credit-note"
          id={note.id}
          source={source}
        />
      </div>
    </>
  );
}
