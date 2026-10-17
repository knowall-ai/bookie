import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, FileText, Mail, Phone, Globe } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { AttachmentsCard } from '@/components/attachments/AttachmentsCard';
import { isConnectorError } from '@/lib/connectors/types';
import type { Contact, Invoice, InvoiceType, Page } from '@/lib/domain/types';
import { describeError } from '@/lib/portal/actions/util';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { StatusBadge } from '@/components/ui/Badge';
import { ErrorPanel } from '@/components/ui/States';
import { cn } from '@/lib/ui/cn';
import { ContactAvatar, RoleBadges, addressLines } from './ContactParts';
import { ContactActions } from './ContactActions';
import { AvailableCredit } from '@/components/sales/AvailableCredit';
import { HistoryPanel } from '@/components/history/HistoryPanel';

const RECENT = 10;

type Recent = { ok: true; page: Page<Invoice> } | { ok: false; error: string } | undefined;

/** One contact, laid out like Xero's contact page. */
export async function ContactDetailPage({ orgParam, id }: { orgParam: string; id: string }) {
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.contacts) notFound();
  const contactId = decodeURIComponent(id);
  const contact = await connector.contacts.get(contactId).catch((error) => {
    if (isConnectorError(error) && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  });

  // BC parties are either a customer or a vendor; Xero contacts can be both, or
  // neither until they have a document, so show both lists for those.
  const showSales = contact.isCustomer || !contact.isSupplier;
  const showBills = contact.isSupplier || !contact.isCustomer;
  const recent = async (type: InvoiceType, show: boolean): Promise<Recent> => {
    if (!show || !connector.invoices) return undefined;
    try {
      return {
        ok: true,
        page: await connector.invoices.list(type, { contactId: contact.id, pageSize: RECENT }),
      };
    } catch (error) {
      return { ok: false, error: describeError(error) };
    }
  };
  const [details, sales, bills] = await Promise.all([
    connector.organisation().catch(() => undefined),
    recent('sales', showSales),
    recent('purchase', showBills),
  ]);
  // Balances are in the organisation's base currency, not the contact's own currency.
  const currency = details?.baseCurrency;
  const listPath = `${base}/contacts`;
  const source = sourceName(org);
  const sourceUrl = connector.sourceLink?.('contact', contact.id);
  const active = contact.status === 'active';

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Contacts', href: listPath }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <ContactAvatar name={contact.name} size="lg" />
            <span className="truncate">{contact.name}</span>
            <RoleBadges contact={contact} />
          </span>
        }
        actions={
          <>
            <ContactActions
              orgKey={org.key}
              id={contact.id}
              name={contact.name}
              source={source}
              editHref={
                connector.contacts.update
                  ? `${listPath}/${encodeURIComponent(contact.id)}/edit`
                  : undefined
              }
              canArchive={active && !!connector.contacts.archive}
            />
            {sourceUrl && (
              <ButtonLink href={sourceUrl} variant="ghost" size="sm">
                Open in {source} <ExternalLink className="h-3.5 w-3.5" />
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ContactDetails contact={contact} />
        <div className="min-w-0 space-y-5">
          <BalanceTiles contact={contact} currency={currency} source={source} />
          {showSales && (
            <AvailableCredit
              connector={connector}
              base={base}
              contactId={contact.id}
              type="sales"
            />
          )}
          {showBills && (
            <AvailableCredit
              connector={connector}
              base={base}
              contactId={contact.id}
              type="purchase"
            />
          )}
          {sales && (
            <RecentDocuments
              title="Invoices"
              noun="invoices"
              result={sales}
              path={`${base}/sales/invoices`}
              newHref={connector.invoices?.create ? `${base}/sales/invoices/new` : undefined}
            />
          )}
          {bills && (
            <RecentDocuments
              title="Bills"
              noun="bills"
              result={bills}
              path={`${base}/purchases/bills`}
              newHref={connector.invoices?.create ? `${base}/purchases/bills/new` : undefined}
            />
          )}
          <AttachmentsCard connector={connector} org={org} entity="contact" id={contact.id} />
        </div>
      </div>
      <div className="mt-5">
        <HistoryPanel
          connector={connector}
          orgKey={org.key}
          entity="contact"
          id={contact.id}
          source={source}
        />
      </div>
    </>
  );
}

function ContactDetails({ contact }: { contact: Contact }) {
  const address = addressLines(contact.address);
  const person = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  const rows: { label: string; value: React.ReactNode }[] = [
    ...(person ? [{ label: 'Primary person', value: person }] : []),
    {
      label: 'Email',
      value: contact.email && (
        <a href={`mailto:${contact.email}`} className="text-brand-bright inline-flex gap-1.5">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-all">{contact.email}</span>
        </a>
      ),
    },
    {
      label: 'Phone',
      value: contact.phone && (
        <a
          href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
          className="text-brand-bright inline-flex gap-1.5"
        >
          <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {contact.phone}
        </a>
      ),
    },
    {
      label: 'Website',
      value: contact.website && (
        <a
          href={
            /^https?:\/\//i.test(contact.website) ? contact.website : `https://${contact.website}`
          }
          target="_blank"
          rel="noreferrer noopener"
          className="text-brand-bright inline-flex gap-1.5"
        >
          <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="break-all">{contact.website.replace(/^https?:\/\//i, '')}</span>
        </a>
      ),
    },
    {
      label: 'Address',
      value: address.length > 0 && (
        <address className="not-italic">
          {address.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </address>
      ),
    },
    { label: 'Tax number', value: contact.taxNumber },
    { label: 'Account number', value: contact.accountNumber },
    ...(contact.currency ? [{ label: 'Currency', value: contact.currency }] : []),
  ];
  return (
    <Card className="h-fit">
      <CardHeader title="Contact details" />
      <dl className="divide-line/70 divide-y px-5">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-3">
            <dt className="text-faint text-xs font-semibold tracking-wide uppercase">
              {row.label}
            </dt>
            <dd className="text-ink min-w-0 text-sm">
              {row.value || <span className="text-faint">—</span>}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function BalanceTiles({
  contact,
  currency,
  source,
}: {
  contact: Contact;
  currency?: string;
  source: string;
}) {
  const b = contact.balances ?? {};
  const tiles: { label: string; amount: number | undefined; danger?: boolean }[] = [];
  if (contact.isCustomer || b.receivable) {
    tiles.push({ label: 'They owe you', amount: b.receivable });
    tiles.push({ label: 'Overdue', amount: b.overdueReceivable, danger: true });
  }
  if (contact.isSupplier || b.payable) {
    tiles.push({ label: 'You owe them', amount: b.payable });
    tiles.push({ label: 'Overdue', amount: b.overduePayable, danger: true });
  }
  if (tiles.length === 0) {
    tiles.push({ label: 'They owe you', amount: b.receivable });
    tiles.push({ label: 'You owe them', amount: b.payable });
  }
  return (
    <div className="space-y-2">
      <div
        className={cn('grid grid-cols-2 gap-3', tiles.length > 2 && 'xl:grid-cols-4')}
        role="group"
        aria-label="Balances"
      >
        {tiles.map((tile, i) => (
          <div key={i} className="card p-4" data-testid="balance-tile">
            <p className="text-faint text-xs font-semibold tracking-wide uppercase">{tile.label}</p>
            <p
              className={cn(
                'mt-1.5 text-xl font-semibold',
                tile.danger && tile.amount ? 'text-danger' : 'text-ink'
              )}
            >
              {tile.amount === undefined ? (
                <span className="text-faint text-sm font-normal">Not available from {source}</span>
              ) : (
                <Money amount={tile.amount} currency={currency} />
              )}
            </p>
          </div>
        ))}
      </div>
      {contact.balancesNote && (
        <p className="text-faint text-xs" data-testid="balances-note">
          {contact.balancesNote}
        </p>
      )}
    </div>
  );
}

function RecentDocuments({
  title,
  noun,
  result,
  path,
  newHref,
}: {
  title: string;
  noun: string;
  result: NonNullable<Recent>;
  path: string;
  newHref?: string;
}) {
  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Number',
      cell: (i) => <span className="text-ink font-medium">{i.number || '—'}</span>,
    },
    {
      key: 'ref',
      header: 'Ref',
      cell: (i) => <span className="text-muted">{i.reference ?? ''}</span>,
      hideOnMobile: true,
    },
    { key: 'date', header: 'Date', cell: (i) => formatDate(i.date), hideOnMobile: true },
    {
      key: 'due',
      header: 'Due date',
      cell: (i) => (
        <span className={i.isOverdue ? 'text-danger font-medium' : undefined}>
          {formatDate(i.dueDate)}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (i) => <Money amount={i.total} currency={i.currency} />,
      hideOnMobile: true,
    },
    {
      key: 'due-amount',
      header: 'Due',
      align: 'right',
      cell: (i) => (
        <Money
          amount={i.amountDue}
          currency={i.currency}
          className="text-ink"
          missing={result.ok ? result.page.note : undefined}
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => <StatusBadge status={i.status} overdue={i.isOverdue} />,
    },
  ];
  return (
    <section aria-labelledby={`recent-${noun}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id={`recent-${noun}`} className="text-ink text-[15px] font-semibold">
          {title}
          {result.ok && result.page.items.length > 0 && (
            <span className="text-faint ml-2 text-sm font-normal">
              {result.page.hasMore ? `Latest ${result.page.items.length}` : ''}
            </span>
          )}
        </h2>
        {newHref && (
          <Link href={newHref} className="text-brand-bright text-sm hover:underline">
            New {noun === 'invoices' ? 'invoice' : 'bill'}
          </Link>
        )}
      </div>
      {!result.ok ? (
        <ErrorPanel title={`Couldn't load ${noun}`} message={result.error} />
      ) : (
        <DataTable
          dense
          columns={columns}
          rows={result.page.items}
          rowKey={(i) => i.id}
          rowHref={(i) => `${path}/${encodeURIComponent(i.id)}`}
          empty={
            <div className="card text-muted flex items-center gap-3 px-5 py-6 text-sm">
              <FileText className="text-faint h-5 w-5" /> No {noun} for this contact yet.
            </div>
          }
        />
      )}
    </section>
  );
}
