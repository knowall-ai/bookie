import Link from 'next/link';
import { FileText, Receipt, Search, Users, ScrollText } from 'lucide-react';
import { orgContext } from '@/lib/portal/context';
import type { Contact, Invoice, Page as ListPage, Quote } from '@/lib/domain/types';
import { describeError } from '@/lib/portal/actions/util';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Money } from '@/components/ui/Money';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorPanel } from '@/components/ui/States';
import { RoleBadges } from '@/components/contacts/ContactParts';
import { SearchForm } from './SearchForm';

export const metadata = { title: 'Search' };

const PER_GROUP = 5;

type Settled<T> = { ok: true; page: ListPage<T> } | { ok: false; error: string };

async function settle<T>(run: () => Promise<ListPage<T>>): Promise<Settled<T>> {
  try {
    return { ok: true, page: await run() };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

interface Row {
  id: string;
  href: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  trailing?: React.ReactNode;
}

interface Group {
  key: string;
  title: string;
  icon: React.ReactNode;
  viewAll: string;
  result: Settled<Row>;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ org: orgParam }, { q }] = await Promise.all([params, searchParams]);
  const { connector, base } = await orgContext(orgParam);
  const term = q?.trim() ?? '';
  const query = { search: term, pageSize: PER_GROUP };
  const enc = encodeURIComponent(term);

  const invoiceRows = (path: string) => (i: Invoice) => ({
    id: i.id,
    href: `${base}${path}/${encodeURIComponent(i.id)}`,
    primary: i.number || i.reference || 'Draft',
    secondary: `${i.contact.name} · ${formatDate(i.date)}`,
    trailing: (
      <>
        <Money amount={i.total} currency={i.currency} className="text-ink" />
        <StatusBadge status={i.status} overdue={i.isOverdue} />
      </>
    ),
  });
  const map = <T,>(r: Settled<T>, fn: (x: T) => Row): Settled<Row> =>
    r.ok ? { ok: true, page: { ...r.page, items: r.page.items.map(fn) } } : r;

  let groups: Group[] = [];
  if (term) {
    const { contacts, invoices, quotes } = connector;
    const [c, inv, bills, qs] = await Promise.all([
      contacts ? settle(() => contacts.list(query)) : undefined,
      invoices ? settle(() => invoices.list('sales', query)) : undefined,
      invoices ? settle(() => invoices.list('purchase', query)) : undefined,
      quotes ? settle(() => quotes.list(query)) : undefined,
    ]);
    const all: (Group | undefined)[] = [
      c && {
        key: 'contacts',
        title: 'Contacts',
        icon: <Users className="h-4 w-4" />,
        viewAll: `${base}/contacts?search=${enc}`,
        result: map(c, (x: Contact) => ({
          id: x.id,
          href: `${base}/contacts/${encodeURIComponent(x.id)}`,
          primary: x.name,
          secondary: x.email ?? x.accountNumber,
          trailing: <RoleBadges contact={x} />,
        })),
      },
      inv && {
        key: 'invoices',
        title: 'Invoices',
        icon: <FileText className="h-4 w-4" />,
        viewAll: `${base}/sales/invoices?search=${enc}`,
        result: map(inv, invoiceRows('/sales/invoices')),
      },
      bills && {
        key: 'bills',
        title: 'Bills',
        icon: <Receipt className="h-4 w-4" />,
        viewAll: `${base}/purchases/bills?search=${enc}`,
        result: map(bills, invoiceRows('/purchases/bills')),
      },
      qs && {
        key: 'quotes',
        title: 'Quotes',
        icon: <ScrollText className="h-4 w-4" />,
        viewAll: `${base}/sales/quotes?search=${enc}`,
        result: map(qs, (x: Quote) => ({
          id: x.id,
          href: `${base}/sales/quotes/${encodeURIComponent(x.id)}`,
          primary: x.number || x.title || 'Quote',
          secondary: `${x.contact.name} · ${formatDate(x.date)}`,
          trailing: (
            <>
              <Money amount={x.total} currency={x.currency} className="text-ink" />
              <StatusBadge status={x.status} />
            </>
          ),
        })),
      },
    ];
    groups = all.filter((g): g is Group => !!g);
  }

  const found = groups.filter((g) => !g.result.ok || g.result.page.items.length > 0);
  const scope = [
    connector.contacts && 'contacts',
    connector.invoices && 'invoices',
    connector.invoices && 'bills',
    connector.quotes && 'quotes',
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Search" />
      <SearchForm initial={term} />
      <div className="mt-6 space-y-6" aria-live="polite">
        {!term ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Search this organisation"
            body={`Find ${listText(scope)} by name, number, reference or email.`}
          />
        ) : found.length === 0 ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title={`No results for “${term}”`}
            body="Check the spelling, or try part of a name, a document number or a reference."
          />
        ) : (
          found.map((group) => <ResultGroup key={group.key} group={group} />)
        )}
      </div>
    </div>
  );
}

function listText(items: (string | false | undefined)[]) {
  const words = items.filter((w): w is string => !!w);
  if (words.length <= 1) return words[0] ?? 'records';
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

function ResultGroup({ group }: { group: Group }) {
  const { result } = group;
  return (
    <section aria-labelledby={`results-${group.key}`} data-testid={`results-${group.key}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2
          id={`results-${group.key}`}
          className="text-ink flex items-center gap-2 text-[15px] font-semibold"
        >
          <span className="text-muted">{group.icon}</span>
          {group.title}
        </h2>
        {result.ok && result.page.hasMore && (
          <Link href={group.viewAll} className="text-brand-bright text-sm hover:underline">
            View all {group.title.toLowerCase()}
          </Link>
        )}
      </div>
      {!result.ok ? (
        <ErrorPanel title={`Couldn't search ${group.title.toLowerCase()}`} message={result.error} />
      ) : (
        <ul className="card divide-line/70 divide-y overflow-hidden">
          {result.page.items.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="hover:bg-surface-2/70 flex items-center gap-4 px-4 py-3 transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm font-medium">{row.primary}</span>
                  {row.secondary && (
                    <span className="text-muted block truncate text-xs">{row.secondary}</span>
                  )}
                </span>
                {row.trailing && (
                  <span className="flex shrink-0 items-center gap-3 text-sm">{row.trailing}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
