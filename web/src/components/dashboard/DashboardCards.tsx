import Link from 'next/link';
import { ArrowUpRight, ChevronRight, Landmark } from 'lucide-react';
import type { BankAccount, DashboardSummary, DocumentBucket } from '@/lib/domain/types';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { Card, CardHeader } from '@/components/ui/Card';
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
        {formatMoney(account.balance, account.currency)}
      </p>
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
      aria-label={`${account.name}: ${formatMoney(account.balance, account.currency)}`}
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
  /** Shown under the totals, e.g. foreign-currency documents left out. */
  note?: string;
}) {
  const awaiting = buckets.awaitingPayment;
  const overduePart = awaiting.total > 0 ? Math.min(1, buckets.overdue.total / awaiting.total) : 0;
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
        <p className="text-ink num mt-1 text-3xl font-semibold tracking-tight">
          {formatMoney(awaiting.total, currency)}
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
        {awaiting.total > 0 && (
          <div
            className="bg-info/25 mt-4 flex h-2 overflow-hidden rounded-full"
            role="img"
            aria-label={`${Math.round(overduePart * 100)}% of the amount awaiting payment is overdue`}
          >
            <span className="bg-danger h-full" style={{ width: `${overduePart * 100}%` }} />
          </div>
        )}
        {awaiting.total > 0 && (
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
            href={listHref ? `${listHref}?status=${status}` : undefined}
            tone={key === 'overdue' && buckets.overdue.count > 0 ? 'danger' : undefined}
          />
        ))}
      </ul>
      {note && (
        <p
          className="text-faint border-line border-t px-5 py-2.5 text-xs"
          data-testid="documents-note"
        >
          {note}
        </p>
      )}
    </Card>
  );
}

function BucketRow({
  label,
  bucket,
  currency,
  href,
  tone,
}: {
  label: string;
  bucket: DocumentBucket;
  currency: string;
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
        <span className="num text-ink">{formatMoney(bucket.total, currency)}</span>
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
