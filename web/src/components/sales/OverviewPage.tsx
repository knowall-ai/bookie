import Link from 'next/link';
import { ArrowRight, FileText, Plus } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { invoiceOverview } from '@/lib/portal/overview';
import type { DocumentBucket, Invoice, InvoiceType } from '@/lib/domain/types';
import type { ModuleName } from '@/lib/portal/nav';
import { formatDate } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { StatusBadge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, NotAvailable } from '@/components/ui/States';

interface QuickLink {
  label: string;
  href: string;
  module: ModuleName;
  description: string;
}

const COPY = {
  sales: {
    title: 'Sales overview',
    section: 'Sales',
    list: '/sales/invoices',
    documents: 'Invoices',
    owed: 'Invoices owed to you',
    party: 'To',
    recent: 'Recent invoices',
    actions: [
      { label: 'New invoice', href: '/sales/invoices/new', module: 'invoices' },
      { label: 'New quote', href: '/sales/quotes/new', module: 'quotes' },
    ],
    links: [
      {
        label: 'Invoices',
        href: '/sales/invoices',
        module: 'invoices',
        description: 'Create, approve and send invoices',
      },
      {
        label: 'Quotes',
        href: '/sales/quotes',
        module: 'quotes',
        description: 'Price up work and turn it into invoices',
      },
      {
        label: 'Credit notes',
        href: '/sales/credit-notes',
        module: 'creditNotes',
        description: 'Credit given to customers',
      },
      {
        label: 'Products and services',
        href: '/sales/products',
        module: 'items',
        description: 'Items you sell, with prices and accounts',
      },
      {
        label: 'Customers',
        href: '/contacts?role=customer',
        module: 'contacts',
        description: 'People and businesses you sell to',
      },
    ] satisfies QuickLink[],
  },
  purchase: {
    title: 'Purchases overview',
    section: 'Purchases',
    list: '/purchases/bills',
    documents: 'Bills',
    owed: 'Bills you need to pay',
    party: 'From',
    recent: 'Recent bills',
    actions: [
      { label: 'New bill', href: '/purchases/bills/new', module: 'invoices' },
      { label: 'New purchase order', href: '/purchases/orders/new', module: 'purchaseOrders' },
    ],
    links: [
      {
        label: 'Bills',
        href: '/purchases/bills',
        module: 'invoices',
        description: 'Enter, approve and pay bills',
      },
      {
        label: 'Purchase orders',
        href: '/purchases/orders',
        module: 'purchaseOrders',
        description: 'Orders you have placed with suppliers',
      },
      {
        label: 'Supplier credit notes',
        href: '/purchases/credit-notes',
        module: 'creditNotes',
        description: 'Credit your suppliers owe you',
      },
      {
        label: 'Suppliers',
        href: '/contacts?role=supplier',
        module: 'contacts',
        description: 'Businesses you buy from',
      },
    ] satisfies QuickLink[],
  },
} as const;

function StatusCard({
  label,
  bucket,
  currency,
  href,
  tone,
}: {
  label: string;
  bucket: DocumentBucket;
  currency: string;
  href: string;
  tone?: 'danger';
}) {
  return (
    <Link
      href={href}
      className="card hover:border-line-strong group flex flex-col gap-2 p-5 transition-colors"
      data-testid={`overview-${label.toLowerCase().replaceAll(' ', '-')}`}
    >
      <span className="text-muted flex items-center justify-between text-sm">
        {label}
        <ArrowRight className="text-faint h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <Money
        amount={bucket.total}
        currency={currency}
        className={cn(
          'text-2xl font-bold',
          tone === 'danger' && bucket.count ? 'text-danger' : 'text-ink'
        )}
      />
      <span className="text-faint text-xs">
        {bucket.count} {bucket.count === 1 ? 'item' : 'items'}
      </span>
    </Link>
  );
}

/** Sales → Sales overview and Purchases → Purchases overview, as in Xero. */
export async function OverviewPage({ orgParam, type }: { orgParam: string; type: InvoiceType }) {
  const { connector, base, org, modules } = await orgContext(orgParam);
  const copy = COPY[type];
  if (!connector.invoices)
    return <NotAvailable feature={copy.documents} source={sourceName(org)} />;

  const [overview, details] = await Promise.all([
    invoiceOverview(connector, type),
    connector.organisation(),
  ]);
  const currency = details.baseCurrency;
  const listPath = `${base}${copy.list}`;

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: 'Number',
      cell: (i) => (
        <span className="text-ink font-medium whitespace-nowrap">{i.number || '—'}</span>
      ),
    },
    {
      key: 'contact',
      header: copy.party,
      cell: (i) => <span className="text-ink">{i.contact.name}</span>,
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
      key: 'amountDue',
      header: 'Due',
      align: 'right',
      cell: (i) => <Money amount={i.amountDue} currency={i.currency} className="text-ink" />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => <StatusBadge status={i.status} overdue={i.isOverdue} />,
    },
  ];

  const actions = copy.actions.filter(
    (a) => modules[a.module] && (a.module !== 'invoices' || connector.invoices?.create)
  );
  const links = copy.links.filter((l) => modules[l.module]);

  return (
    <>
      <PageHeader
        title={copy.title}
        actions={actions.map((a, i) => (
          <ButtonLink
            key={a.href}
            href={`${base}${a.href}`}
            variant={i === 0 ? 'primary' : 'secondary'}
          >
            <Plus className="h-4 w-4" /> {a.label}
          </ButtonLink>
        ))}
      />

      {overview && (
        <section aria-labelledby="owed-heading" className="mb-6">
          <h2 id="owed-heading" className="text-ink mb-3 text-[15px] font-semibold">
            {copy.owed}
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatusCard
              label="Draft"
              bucket={overview.draft}
              currency={currency}
              href={`${listPath}?status=draft`}
            />
            <StatusCard
              label="Awaiting approval"
              bucket={overview.awaitingApproval}
              currency={currency}
              href={`${listPath}?status=submitted`}
            />
            <StatusCard
              label="Awaiting payment"
              bucket={overview.awaitingPayment}
              currency={currency}
              href={`${listPath}?status=authorised`}
            />
            <StatusCard
              label="Overdue"
              bucket={overview.overdue}
              currency={currency}
              href={`${listPath}?status=overdue`}
              tone="danger"
            />
          </div>
          {overview.truncated && (
            <p className="text-faint mt-2 text-xs">
              Totals cover the first 500 documents in each status. Open the list for the full set.
            </p>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="recent-heading" className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-heading" className="text-ink text-[15px] font-semibold">
              {copy.recent}
            </h2>
            <Link href={listPath} className="text-brand-bright text-sm hover:underline">
              View all {copy.documents.toLowerCase()}
            </Link>
          </div>
          <DataTable
            dense
            columns={columns}
            rows={overview?.recent ?? []}
            rowKey={(i) => i.id}
            rowHref={(i) => `${listPath}/${encodeURIComponent(i.id)}`}
            empty={
              <EmptyState
                icon={<FileText className="h-6 w-6" />}
                title={`No ${copy.documents.toLowerCase()} yet`}
              />
            }
          />
        </section>

        <Card className="h-fit">
          <CardHeader title="Quick links" />
          <nav aria-label={`${copy.section} quick links`}>
            <ul className="divide-line divide-y">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={`${base}${l.href}`}
                    className="hover:bg-surface-2/70 group flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <span className="min-w-0">
                      <span className="text-ink block text-sm font-medium">{l.label}</span>
                      <span className="text-muted block text-xs">{l.description}</span>
                    </span>
                    <ArrowRight className="text-faint group-hover:text-brand-bright h-4 w-4 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Card>
      </div>
    </>
  );
}
