import { notFound } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, Check, Receipt } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { BankTransaction } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Pagination } from '@/components/ui/Pagination';
import { SearchBox } from '@/components/ui/SearchBox';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { SourceNote } from '@/components/accounting/SourceNote';

export const metadata = { title: 'Account transactions' };

const isIncoming = (t: BankTransaction) => t.type === 'receive' || t.type === 'transfer-in';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const [{ org: orgParam, id: rawId }, query] = await Promise.all([params, searchParams]);
  const { connector, base, org } = await orgContext(orgParam);
  const bank = connector.bank;
  if (!bank) notFound();
  const id = decodeURIComponent(rawId);
  const account = (await bank.accounts()).find((a) => a.id === id);
  if (!account) notFound();

  const page = Math.max(1, Number(query.page) || 1);
  const result = await bank
    .transactions(id, { page, pageSize: 50, search: query.search })
    .catch((error) => {
      if (isConnectorError(error) && error.status === 404) notFound();
      throw error;
    });

  const listPath = `${base}/accounting/bank/${encodeURIComponent(id)}`;
  const newHref = `${base}/accounting/bank/new`;
  const currency = account.currency;

  const columns: Column<BankTransaction>[] = [
    { key: 'date', header: 'Date', cell: (t) => formatDate(t.date) },
    {
      key: 'description',
      header: 'Description',
      cell: (t) => (
        <span className="flex flex-col">
          <span className="text-ink">{t.description || t.contact?.name || '—'}</span>
          {t.contact?.name && t.description && t.description !== t.contact.name && (
            <span className="text-faint text-xs">{t.contact.name}</span>
          )}
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      cell: (t) => <span className="text-muted">{t.reference ?? ''}</span>,
      hideOnMobile: true,
    },
    {
      key: 'spent',
      header: 'Spent',
      align: 'right',
      cell: (t) => (isIncoming(t) ? '' : <Money amount={t.amount} className="text-ink" />),
    },
    {
      key: 'received',
      header: 'Received',
      align: 'right',
      cell: (t) => (isIncoming(t) ? <Money amount={t.amount} className="text-ink" /> : ''),
    },
    {
      key: 'reconciled',
      header: 'Reconciled',
      align: 'center',
      cell: (t) =>
        t.isReconciled ? (
          <Check className="text-brand-bright mx-auto h-4 w-4" aria-label="Reconciled" />
        ) : (
          <span className="sr-only">Not reconciled</span>
        ),
    },
  ];

  const canCreate = !!bank.createTransaction;
  return (
    <>
      <PageHeader
        title={account.name}
        crumbs={[
          { label: 'Accounting', href: `${base}/accounting` },
          { label: 'Bank accounts', href: `${base}/accounting/bank` },
        ]}
        meta={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {account.accountNumber && <span>{account.accountNumber}</span>}
            {account.balance !== undefined && (
              <span>
                Balance in {sourceName(org)}:{' '}
                <Money amount={account.balance} currency={currency} className="text-ink" />
              </span>
            )}
          </span>
        }
        actions={
          canCreate && (
            <>
              <ButtonLink href={`${newHref}?type=spend&account=${encodeURIComponent(id)}`}>
                <ArrowUpRight className="h-4 w-4" /> Spend money
              </ButtonLink>
              <ButtonLink href={`${newHref}?type=receive&account=${encodeURIComponent(id)}`}>
                <ArrowDownLeft className="h-4 w-4" /> Receive money
              </ButtonLink>
            </>
          )
        }
      />
      <SourceNote>{result.note}</SourceNote>
      {!result.note || result.items.length > 0 || query.search ? (
        <>
          <div className="mb-4 flex items-center gap-3">
            <SearchBox placeholder="Search by reference" className="w-full max-w-md" />
            {result.total !== undefined && (
              <span className="text-muted text-sm">
                {result.total} {result.total === 1 ? 'transaction' : 'transactions'}
              </span>
            )}
          </div>
          <DataTable
            columns={columns}
            rows={result.items}
            rowKey={(t) => t.id}
            empty={
              <EmptyState
                icon={<Receipt className="h-6 w-6" />}
                title={
                  query.search
                    ? `No transactions match “${query.search}”`
                    : 'No transactions in this account yet'
                }
              />
            }
          />
          <Pagination
            page={result.page}
            hasMore={result.hasMore}
            basePath={listPath}
            params={{ search: query.search }}
          />
        </>
      ) : null}
    </>
  );
}
