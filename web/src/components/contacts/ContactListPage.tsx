import { Plus, Users } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import type { Contact } from '@/lib/domain/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/ui/SearchBox';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, NotAvailable } from '@/components/ui/States';
import { formatMoney } from '@/lib/ui/format';
import { ContactAvatar, RoleBadges } from './ContactParts';
import { ContactTabs, contactTab } from './ContactTabs';

export interface ContactSearchParams {
  role?: string;
  status?: string;
  search?: string;
  page?: string;
}

const TITLES = {
  all: 'Contacts',
  customers: 'Customers',
  suppliers: 'Suppliers',
  archived: 'Archived contacts',
} as const;

const EMPTY = {
  all: 'No contacts here yet',
  customers: 'No customers yet',
  suppliers: 'No suppliers yet',
  archived: 'No archived contacts',
} as const;

/** Contacts → All contacts / Customers / Suppliers / Archived, laid out like Xero's. */
export async function ContactListPage({
  orgParam,
  searchParams,
}: {
  orgParam: string;
  searchParams: ContactSearchParams;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.contacts) return <NotAvailable feature="Contacts" source={sourceName(org)} />;

  const tab = contactTab(searchParams);
  const page = Math.max(1, Number(searchParams.page) || 1);
  const search = searchParams.search?.trim() || undefined;
  const [result, details] = await Promise.all([
    connector.contacts.list({
      role: tab === 'customers' ? 'customer' : tab === 'suppliers' ? 'supplier' : undefined,
      status: tab === 'archived' ? 'archived' : undefined,
      search,
      page,
      pageSize: 50,
    }),
    connector.organisation().catch(() => undefined),
  ]);
  const listPath = `${base}/contacts`;
  // Balances are in the organisation's base currency (Xero converts; BC reports LCY),
  // not the contact's own currency.
  const currency = details?.baseCurrency;

  const columns: Column<Contact>[] = [
    {
      key: 'name',
      header: 'Contact',
      cell: (c) => (
        <span className="flex min-w-0 items-center gap-3">
          <ContactAvatar name={c.name} />
          <span className="min-w-0">
            <span className="text-ink block truncate font-medium" data-testid="contact-name">
              {c.name}
            </span>
            {(c.firstName || c.lastName || c.accountNumber) && (
              <span className="text-faint block truncate text-xs">
                {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.accountNumber}
              </span>
            )}
          </span>
          {tab === 'all' && (
            <span className="hidden lg:inline-flex">
              <RoleBadges contact={c} />
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      cell: (c) => <span className="text-muted break-all">{c.email ?? ''}</span>,
      hideOnMobile: true,
    },
    {
      key: 'phone',
      header: 'Phone',
      cell: (c) => <span className="text-muted whitespace-nowrap">{c.phone ?? ''}</span>,
      hideOnMobile: true,
    },
    {
      key: 'payable',
      header: 'You owe',
      align: 'right',
      cell: (c) => (
        <Balance amount={c.balances?.payable} currency={currency} note={c.balancesNote} />
      ),
    },
    {
      key: 'receivable',
      header: 'They owe',
      align: 'right',
      cell: (c) => (
        <span className="flex flex-col items-end">
          <Balance amount={c.balances?.receivable} currency={currency} note={c.balancesNote} />
          {!!c.balances?.overdueReceivable && (
            <span className="text-danger text-xs whitespace-nowrap">
              {formatMoney(c.balances.overdueReceivable, currency)} overdue
            </span>
          )}
        </span>
      ),
    },
  ];

  const canCreate = !!connector.contacts.create;
  const newHref = `${listPath}/new${tab === 'suppliers' ? '?role=supplier' : ''}`;
  return (
    <>
      <PageHeader
        title={TITLES[tab]}
        crumbs={tab === 'all' ? undefined : [{ label: 'Contacts', href: listPath }]}
        actions={
          canCreate && (
            <ButtonLink href={newHref} variant="primary">
              <Plus className="h-4 w-4" /> New contact
            </ButtonLink>
          )
        }
      />
      <ContactTabs current={tab} basePath={listPath} search={search} />
      <div className="mb-4 flex items-center gap-3">
        <SearchBox
          placeholder="Search by name, email or account number"
          className="w-full max-w-md"
        />
        {result.total !== undefined && (
          <span className="text-muted ml-auto text-sm whitespace-nowrap">
            {result.total} {result.total === 1 ? 'contact' : 'contacts'}
          </span>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={result.items}
        rowKey={(c) => c.id}
        rowHref={(c) => `${listPath}/${encodeURIComponent(c.id)}`}
        empty={
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={search ? `No contacts match “${search}”` : EMPTY[tab]}
            body={
              search
                ? 'Try a different name, email address or account number.'
                : tab === 'archived'
                  ? 'Contacts you archive appear here.'
                  : undefined
            }
            action={
              canCreate &&
              tab !== 'archived' &&
              !search && (
                <ButtonLink href={newHref} variant="primary">
                  New contact
                </ButtonLink>
              )
            }
          />
        }
      />
      <Pagination
        page={result.page}
        hasMore={result.hasMore}
        basePath={listPath}
        params={{ role: searchParams.role, status: searchParams.status, search }}
      />
    </>
  );
}

/** Zero balances are muted so the amounts owed stand out. */
function Balance({
  amount,
  currency,
  note,
}: {
  amount: number | undefined;
  currency?: string;
  note?: string;
}) {
  if (amount === undefined)
    return (
      <span className="text-faint" title={note}>
        {note ? 'Not available' : '—'}
      </span>
    );
  if (amount === 0) return <span className="text-faint num">{formatMoney(0)}</span>;
  return <Money amount={amount} currency={currency} className="text-ink" />;
}
