import Link from 'next/link';
import { ArrowUpRight, ChevronRight, Landmark } from 'lucide-react';
import type { BankAccount, DashboardSummary, DocumentBucket } from '@/lib/domain/types';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { NotAvailableValue } from '@/components/ui/Money';
import { cn } from '@/lib/ui/cn';

/* ------------------------------------------------------------------ */
/* Bank accounts                                                       */
/* ------------------------------------------------------------------ */

export function BankAccountCard({ account, href }: { account: BankAccount; href?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink truncate font-semibold">{account.name}</p>
          <p className="text-faint mt-0.5 truncate text-xs">
            {account.accountNumber ?? account.code ?? account.currency}
          </p>
        </div>
        <span className="bg-surface-2 text-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
          <Landmark className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="text-faint mt-5 text-xs tracking-wide uppercase">Balance in books</p>
      <p className="text-ink num mt-1 text-2xl font-semibold tracking-tight">
        {account.balance === undefined ? (
          <NotAvailableValue reason="The source doesn't report this account's balance." />
        ) : (
          formatMoney(account.balance, account.balanceCurrency ?? account.currency)
        )}
      </p>
      {account.balanceCurrency && account.balance !== undefined && (
        <p className="text-faint mt-0.5 text-xs">
          In {account.balanceCurrency}, the base currency, as the source reports it
        </p>
      )}
      {(account.statementBalance !== undefined || account.unreconciledCount) && (
        <div className="border-line text-muted mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
          {account.statementBalance !== undefined && (
            <span>
              Statement{account.statementDate ? ` ${formatDate(account.statementDate)}` : ''}:{' '}
              <span className="num text-body">
                {formatMoney(account.statementBalance, account.currency)}
              </span>
            </span>
          )}
          {!!account.unreconciledCount && (
            <span className="text-warn font-medium">{account.unreconciledCount} to reconcile</span>
          )}
        </div>
      )}
    </>
  );
  const className = 'card block px-5 py-4';
  return href ? (
    <Link
      href={href}
      className={cn(className, 'hover:border-line-strong group transition-colors')}
      aria-label={`${account.name}: ${account.balance === undefined ? 'balance not available' : formatMoney(account.balance, account.balanceCurrency ?? account.currency)}`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Invoices owed to you / Bills to pay                                 */
/* ------------------------------------------------------------------ */

type Buckets = DashboardSummary['receivables'];

const ROWS: { key: keyof Buckets; label: string; status: string }[] = [
  { key: 'draft', label: 'Draft', status: 'draft' },
  { key: 'awaitingApproval', label: 'Awaiting approval', status: 'submitted' },
  { key: 'awaitingPayment', label: 'Awaiting payment', status: 'authorised' },
  { key: 'overdue', label: 'Overdue', status: 'overdue' },
];

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * A bucket's amount exactly as the source gave it: one total, a total per
 * currency (never converted), or "not available" when an amount is unreported.
 */
export function BucketAmount({
  bucket,
  currency,
  missing,
}: {
  bucket: DocumentBucket;
  currency: string;
  missing?: string;
}) {
  if (bucket.total !== undefined) return <>{formatMoney(bucket.total, currency)}</>;
  if (bucket.byCurrency?.length) {
    return (
      <span title={missing}>
        {bucket.byCurrency.map((c, i) => (
          <span key={c.currency} className="whitespace-nowrap">
            {i > 0 && ' + '}
            {formatMoney(c.total, c.currency)}
          </span>
        ))}
        {bucket.unknownCount ? (
          <span className="text-faint"> + {bucket.unknownCount} not available</span>
        ) : null}
      </span>
    );
  }
  if (bucket.count === 0) return <>{formatMoney(0, currency)}</>;
  return <NotAvailableValue reason={missing} />;
}

export function DocumentsCard({
  title,
  noun,
  buckets,
  currency,
  listHref,
  newHref,
  newLabel,
  note,
}: {
  title: string;
  noun: 'invoice' | 'bill';
  buckets: Buckets;
  currency: string;
  listHref?: string;
  newHref?: string;
  newLabel?: string;
  /** Why an amount is missing (e.g. BC doesn't report what's left to pay on bills). */
  note?: string;
}) {
  const awaiting = buckets.awaitingPayment;
  const overdueTotal = buckets.overdue.total;
  // The overdue bar needs both totals in one currency; otherwise it would be a guess.
  const showBar = awaiting.total !== undefined && awaiting.total > 0 && overdueTotal !== undefined;
  const overduePart = showBar ? Math.min(1, overdueTotal / awaiting.total!) : 0;
  const mixed = !!awaiting.byCurrency?.length;
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={title}
        action={
          newHref && (
            <Link href={newHref} className="text-brand-bright text-sm font-medium hover:underline">
              {newLabel}
            </Link>
          )
        }
      />
      <div className="px-5 pt-4 pb-2">
        <p className="text-faint text-xs tracking-wide uppercase">Awaiting payment</p>
        <p
          className={cn(
            'text-ink num mt-1 font-semibold tracking-tight',
            mixed ? 'text-xl' : 'text-3xl'
          )}
          data-testid={`${noun}-awaiting-total`}
        >
          <BucketAmount bucket={awaiting} currency={currency} missing={note} />
        </p>
        <p className="text-muted mt-1 text-sm">
          {plural(awaiting.count, noun)}
          {buckets.overdue.count > 0 && (
            <>
              {' · '}
              <span className="text-danger font-medium">{buckets.overdue.count} overdue</span>
            </>
          )}
        </p>
        {(note || mixed) && (
          <p className="text-faint mt-2 text-xs" role="note" data-testid={`${noun}-amount-note`}>
            {note ??
              'Amounts are in each document’s own currency; the source doesn’t provide a conversion rate.'}
          </p>
        )}
        {showBar && (
          <div
            className="bg-info/25 mt-4 flex h-2 overflow-hidden rounded-full"
            role="img"
            aria-label={`${Math.round(overduePart * 100)}% of the amount awaiting payment is overdue`}
          >
            <span className="bg-danger h-full" style={{ width: `${overduePart * 100}%` }} />
          </div>
        )}
        {showBar && (
          <div className="text-faint mt-1.5 flex justify-between text-xs">
            <span>Overdue</span>
            <span>Not yet due</span>
          </div>
        )}
      </div>
      <ul className="mt-auto px-2 pb-2">
        {ROWS.map(({ key, label, status }) => (
          <BucketRow
            key={key}
            label={label}
            bucket={buckets[key]}
            currency={currency}
            missing={note}
            href={listHref ? `${listHref}?status=${status}` : undefined}
            tone={key === 'overdue' && buckets.overdue.count > 0 ? 'danger' : undefined}
          />
        ))}
      </ul>
    </Card>
  );
}

function BucketRow({
  label,
  bucket,
  currency,
  missing,
  href,
  tone,
}: {
  label: string;
  bucket: DocumentBucket;
  currency: string;
  missing?: string;
  href?: string;
  tone?: 'danger';
}) {
  const content = (
    <>
      <span className={cn('text-body', tone === 'danger' && 'text-danger font-medium')}>
        {label}
        <span className="text-faint ml-1.5">({bucket.count})</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="num text-ink text-right">
          <BucketAmount bucket={bucket} currency={currency} missing={missing} />
        </span>
        {href && <ChevronRight className="text-faint h-4 w-4" aria-hidden />}
      </span>
    </>
  );
  const className = 'flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm';
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(className, 'hover:bg-surface-2 transition-colors')}>
          {content}
        </Link>
      ) : (
        <div className={className}>{content}</div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Profit and loss this financial year                                 */
/* ------------------------------------------------------------------ */

export function ProfitAndLossTile({
  pl,
  currency,
  href,
}: {
  pl: NonNullable<DashboardSummary['profitAndLoss']>;
  currency: string;
  href?: string;
}) {
  const margin = pl.income ? Math.round((pl.net / pl.income) * 100) : undefined;
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Profit and loss"
        subtitle={`This financial year · ${formatDate(pl.from)} to ${formatDate(pl.to)}`}
      />
      <div className="flex-1 px-5 py-4">
        <p className="text-faint text-xs tracking-wide uppercase">
          Net {pl.net < 0 ? 'loss' : 'profit'}
        </p>
        <p
          className={cn(
            'num mt-1 text-3xl font-semibold tracking-tight',
            pl.net < 0 ? 'text-danger' : 'text-ink'
          )}
        >
          {formatMoney(pl.net, currency)}
        </p>
        {margin !== undefined && <p className="text-muted mt-1 text-sm">{margin}% net margin</p>}
        <dl className="border-line mt-5 grid grid-cols-2 gap-4 border-t pt-4">
          <div>
            <dt className="text-muted text-sm">Income</dt>
            <dd className="text-ink num mt-0.5 text-lg font-semibold">
              {formatMoney(pl.income, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-sm">Expenses</dt>
            <dd className="text-ink num mt-0.5 text-lg font-semibold">
              {formatMoney(pl.expenses, currency)}
            </dd>
          </div>
        </dl>
      </div>
      {href && (
        <Link
          href={href}
          className="border-line text-brand-bright hover:bg-surface-2 flex items-center gap-1 rounded-b-(--radius-card) border-t px-5 py-3 text-sm font-medium transition-colors"
        >
          View profit and loss <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </Card>
  );
}
