import { notFound } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, Check, Paperclip, Receipt } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { BankTransaction, BankTransactionQuery } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Money } from '@/components/ui/Money';
import { Pagination } from '@/components/ui/Pagination';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { SourceNote } from '@/components/accounting/SourceNote';
import {
  RegisterFilters,
  type RegisterFilterValues,
} from '@/components/accounting/RegisterFilters';
import { registerTypeLabel } from '@/components/accounting/register';

export const metadata = { title: 'Account transactions' };

const isIncoming = (t: BankTransaction) => t.type === 'receive' || t.type === 'transfer-in';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const GUIDISH = /^[\w~.-]{1,80}$/;

/** URL params → validated filter values (anything unexpected is dropped). */
function readFilters(query: Record<string, string | undefined>): RegisterFilterValues {
  return {
    search: query.search?.trim().slice(0, 100) || undefined,
    from: query.from && ISO.test(query.from) ? query.from : undefined,
    to: query.to && ISO.test(query.to) ? query.to : undefined,
    direction:
      query.direction === 'spent' || query.direction === 'received' ? query.direction : undefined,
    reconciled:
      query.reconciled === 'yes' || query.reconciled === 'no' ? query.reconciled : undefined,
    contact: query.contact && GUIDISH.test(query.contact) ? query.contact : undefined,
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ org: orgParam, id: rawId }, query] = await Promise.all([params, searchParams]);
  const { connector, base, org } = await orgContext(orgParam);
  const bank = connector.bank;
  if (!bank) notFound();
  const id = decodeURIComponent(rawId);
  const account = (await bank.accounts()).find((a) => a.id === id);
  if (!account) notFound();

  const supports = bank.filters ?? {};
  const filters = readFilters(query);
  const page = Math.max(1, Number(query.page) || 1);
  const request: BankTransactionQuery = {
    page,
    pageSize: 50,
    search: filters.search,
    from: filters.from,
    to: filters.to,
    direction: supports.direction ? filters.direction : undefined,
    reconciled:
      supports.reconciled && filters.reconciled ? filters.reconciled === 'yes' : undefined,
    contactId: supports.contact ? filters.contact : undefined,
  };
  const [result, contact] = await Promise.all([
    bank.transactions(id, request).catch((error) => {
      if (isConnectorError(error) && error.status === 404) notFound();
      throw error;
    }),
    request.contactId
      ? connector.contacts?.get(request.contactId).catch(() => undefined)
      : undefined,
  ]);

  const listPath = `${base}/accounting/bank/${encodeURIComponent(id)}`;
  const newHref = `${base}/accounting/bank/new`;
  const currency = account.currency;
  const filtered = Object.values(filters).some(Boolean);
  const detailHref = bank.transaction
    ? (t: BankTransaction) =>
        `${listPath}/transactions/${encodeURIComponent(t.id)}${t.source ? `?source=${t.source}` : ''}`
    : undefined;

  const columns: Column<BankTransaction>[] = [
    { key: 'date', header: 'Date', cell: (t) => formatDate(t.date) },
    {
      key: 'description',
      header: 'Description',
      cell: (t) => (
        <span className="flex flex-col">
          <span className="text-ink flex items-center gap-1.5">
            {t.description || t.contact?.name || '—'}
            {t.hasAttachments && (
              <Paperclip className="text-faint h-3.5 w-3.5" aria-label="Has attachments" />
            )}
          </span>
          {t.contact?.name && t.description && t.description !== t.contact.name && (
            <span className="text-faint text-xs">{t.contact.name}</span>
          )}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (t) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted">{registerTypeLabel(t)}</span>
          {t.batchPaymentId && <Badge>Batch</Badge>}
        </span>
      ),
      hideOnMobile: true,
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
  // Sources that can't list transactions at all explain why in `note` and return nothing.
  const unavailable = !!result.note && result.items.length === 0 && !filtered;
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
            <span>Account transactions</span>
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
      {!unavailable && <SourceNote>{bank.limitations}</SourceNote>}
      {!unavailable && (
        <>
          <RegisterFilters
            action={listPath}
            value={filters}
            supports={supports}
            contactName={contact?.name}
          />
          {result.total !== undefined && (
            <p className="text-muted mb-3 text-sm" aria-live="polite">
              {result.total} {result.total === 1 ? 'transaction' : 'transactions'}
            </p>
          )}
          <DataTable
            columns={columns}
            rows={result.items}
            rowKey={(t) => `${t.source ?? ''}:${t.id}`}
            rowHref={detailHref}
            empty={
              <EmptyState
                icon={<Receipt className="h-6 w-6" />}
                title={
                  filtered
                    ? 'No transactions match these filters'
                    : 'No transactions in this account yet'
                }
              />
            }
          />
          <Pagination
            page={result.page}
            hasMore={result.hasMore}
            basePath={listPath}
            params={{ ...filters }}
          />
        </>
      )}
    </>
  );
}
