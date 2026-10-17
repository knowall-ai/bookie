import { notFound } from 'next/navigation';
import { FileMinus } from 'lucide-react';
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
import { EmptyState, NotAvailable } from '@/components/ui/States';
import {
  baseTotalRows,
  currencyFacts,
  DocumentFacts,
  DocumentLines,
  DocumentTotals,
} from '@/components/documents/DocumentParts';
import type { ListSearchParams } from '@/components/documents/InvoiceListPage';

const COPY = {
  sales: {
    title: 'Credit notes',
    section: 'Sales',
    sectionPath: '/sales',
    path: '/sales/credit-notes',
    party: 'To',
    noun: 'credit notes',
  },
  purchase: {
    title: 'Supplier credit notes',
    section: 'Purchases',
    sectionPath: '/purchases',
    path: '/purchases/credit-notes',
    party: 'From',
    noun: 'supplier credit notes',
  },
} as const;

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
      cell: (c) => <Money amount={c.remainingCredit} currency={c.currency} className="text-ink" />,
    },
    { key: 'status', header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <>
      <PageHeader title={copy.title} crumbs={crumbs} />
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
              !searchParams.search && status === 'all'
                ? `Credit notes are raised in ${sourceName(org)} against an invoice or bill, and appear here.`
                : undefined
            }
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
}: {
  orgParam: string;
  id: string;
  type: CreditNoteType;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.creditNotes) notFound();
  const note = await connector.creditNotes.get(decodeURIComponent(id)).catch((error) => {
    if (isConnectorError(error) && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  });
  if (note.type !== type) notFound();
  const baseCurrency = (await connector.organisation().catch(() => undefined))?.baseCurrency;
  const copy = COPY[type];
  const allocated = note.status === 'voided' ? 0 : note.total - note.remainingCredit;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: copy.section, href: `${base}${copy.sectionPath}` },
          { label: copy.title, href: `${base}${copy.path}` },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Credit note {note.number}
            <StatusBadge status={note.status} />
          </span>
        }
      />
      <div className="space-y-5">
        <DocumentFacts
          facts={[
            { label: copy.party, value: note.contact.name },
            { label: 'Date', value: formatDate(note.date) },
            { label: 'Credit note number', value: note.number || '—' },
            { label: 'Reference', value: note.reference || '—' },
            ...(currencyFacts(note, baseCurrency, sourceName(org)).length
              ? currencyFacts(note, baseCurrency, sourceName(org))
              : [{ label: 'Currency', value: note.currency }]),
          ]}
        />
        <DocumentLines lines={note.lineItems ?? []} currency={note.currency} />
        <DocumentTotals
          currency={note.currency}
          rows={[
            { label: 'Subtotal', amount: note.subTotal },
            { label: 'Total tax', amount: note.totalTax, muted: true },
            { label: 'Total', amount: note.total, strong: true },
            ...baseTotalRows(note, baseCurrency),
            ...(allocated > 0
              ? [{ label: 'Less allocated or refunded', amount: -allocated, muted: true }]
              : []),
            { label: 'Remaining credit', amount: note.remainingCredit, strong: true },
          ]}
        />
      </div>
    </>
  );
}
