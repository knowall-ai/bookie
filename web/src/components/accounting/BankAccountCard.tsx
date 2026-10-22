import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, CreditCard, Landmark, Wallet } from 'lucide-react';
import type { BankAccount } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { Money } from '@/components/ui/Money';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import {
  BankCardHistory,
  BankFreshness,
  type HistoriesPromise,
} from '@/components/bank/BankCardHistory';

const ICON = { bank: Landmark, 'credit-card': CreditCard, paypal: Wallet, other: Landmark };

/** One Xero-style bank account card: balances on the left, actions at the bottom. */
export function BankAccountCard({
  account,
  href,
  newHref,
  sourceLabel,
  source,
  histories,
  feedNote,
}: {
  account: BankAccount;
  href: string;
  /** Spend/receive money link, when the source supports it. */
  newHref?: string;
  /** Short source name for "Balance in Xero" / "Balance in BC". */
  sourceLabel: string;
  /** Full source name, e.g. "Business Central". */
  source: string;
  /** The source's balance histories (shared by every card), or undefined when it has none. */
  histories?: HistoriesPromise;
  feedNote?: string;
}) {
  const Icon = ICON[account.type ?? 'bank'] ?? Landmark;
  return (
    <article className="card flex flex-col" aria-labelledby={`bank-${account.id}`}>
      <div className="border-line flex items-start gap-3 border-b px-5 py-4">
        <div className="bg-brand/10 text-brand-bright flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id={`bank-${account.id}`} className="text-ink truncate font-semibold">
            {/* The card body below is the keyboard way in; this is for the mouse. */}
            <Link href={href} className="hover:text-brand-bright transition-colors" tabIndex={-1}>
              {account.name}
            </Link>
          </h2>
          <p className="text-muted truncate text-sm">
            {[account.code, account.accountNumber].filter(Boolean).join(' · ') ||
              'No account number'}
          </p>
        </div>
        <Badge>{account.currency}</Badge>
      </div>

      {/* The balances and chart open the account too, so the whole card is a way in. */}
      <Link
        href={href}
        className="hover:bg-surface-2/40 focus-visible:bg-surface-2/40 block flex-1 px-5 py-4 transition-colors"
        aria-label={`${account.name}: balance and history`}
        aria-describedby={`bank-history-${account.id}`}
        data-testid="bank-account-card"
      >
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-faint text-xs font-semibold tracking-wide uppercase">
              Balance in {sourceLabel}
            </dt>
            <dd className="text-ink mt-1 text-lg font-semibold">
              {account.balance === undefined ? (
                <span className="text-muted text-sm font-normal">Not available</span>
              ) : (
                <Money
                  amount={account.balance}
                  currency={account.balanceCurrency ?? account.currency}
                />
              )}
            </dd>
          </div>
          <div>
            <dt className="text-faint text-xs font-semibold tracking-wide uppercase">
              Last statement
            </dt>
            <dd className="text-ink mt-1 text-lg font-semibold">
              {account.statementBalance === undefined ? (
                <span className="text-muted text-sm font-normal">Not available</span>
              ) : (
                <>
                  <Money amount={account.statementBalance} currency={account.currency} />
                  {account.statementDate && (
                    <span className="text-faint block text-xs font-normal">
                      at {formatDate(account.statementDate)}
                    </span>
                  )}
                </>
              )}
            </dd>
          </div>
          <div className="col-span-2">
            {account.unreconciledCount === undefined ? null : account.unreconciledCount > 0 ? (
              <p className="text-warn text-sm" data-testid="unreconciled">
                {account.unreconciledCount} unreconciled{' '}
                {account.unreconciledCount === 1 ? 'transaction' : 'transactions'}
              </p>
            ) : (
              <p className="text-brand-bright text-sm" data-testid="unreconciled">
                All transactions reconciled
              </p>
            )}
          </div>
        </dl>
        <div className="mt-4" id={`bank-history-${account.id}`}>
          <BankCardHistory histories={histories} accountId={account.id} source={source} />
        </div>
        <div className="mt-3">
          <BankFreshness account={account} source={source} feedNote={feedNote} />
        </div>
      </Link>

      <div className="border-line flex flex-wrap gap-2 border-t px-5 py-3">
        <Link href={href} className={buttonClass('secondary', 'sm')}>
          Account transactions
        </Link>
        {newHref && (
          <>
            <Link
              href={`${newHref}?type=spend&account=${encodeURIComponent(account.id)}`}
              className={buttonClass('ghost', 'sm')}
              aria-label={`Spend money from ${account.name}`}
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden /> Spend
            </Link>
            <Link
              href={`${newHref}?type=receive&account=${encodeURIComponent(account.id)}`}
              className={buttonClass('ghost', 'sm')}
              aria-label={`Receive money into ${account.name}`}
            >
              <ArrowDownLeft className="h-4 w-4" aria-hidden /> Receive
            </Link>
          </>
        )}
      </div>
    </article>
  );
}
