import { Suspense } from 'react';
import type { BalanceHistory, BankAccount, BankBalanceHistories } from '@/lib/domain/types';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { HISTORY_DAYS } from '@/lib/connectors/balance-history';
import { BalanceChart } from './BalanceChart';

/** Every card on a page shares one read of the source's histories. */
export type HistoriesPromise = Promise<BankBalanceHistories | undefined>;

const WEEKS = HISTORY_DAYS / 7;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** One sentence a screen reader gets instead of the chart. */
export function historySummary(history: BalanceHistory): string {
  const first = history.points[0];
  const last = history.points[history.points.length - 1];
  const low = Math.min(...history.points.map((p) => p.balance));
  const high = Math.max(...history.points.map((p) => p.balance));
  const money = (n: number) => formatMoney(n, history.currency);
  return (
    `Balance over the last ${WEEKS} weeks${history.interval === 'week' ? ', weekly' : ''}: ` +
    `${money(first.balance)} on ${formatDate(first.date)} to ${money(last.balance)} on ${formatDate(last.date)}, ` +
    `lowest ${money(low)}, highest ${money(high)}.`
  );
}

/** The history for one account, matching BC's GUIDs whatever their case. */
export function historyFor(all: BankBalanceHistories, accountId: string) {
  return all.accounts[accountId] ?? all.accounts[accountId.toLowerCase()];
}

/** "read 3 min ago" when a cached history is a minute old or more, so it never passes for live. */
export function readAtLabel(readAt: string, now = Date.now()): string | undefined {
  const at = Date.parse(readAt);
  if (Number.isNaN(at)) return undefined;
  const minutes = Math.floor((now - at) / 60_000);
  return minutes >= 1 ? `read ${minutes} min ago` : undefined;
}

function HistoryNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-faint flex h-14 items-center text-xs" data-testid="balance-history-note">
      {children}
    </p>
  );
}

async function LoadedHistory({
  histories,
  accountId,
  source,
}: {
  histories: HistoriesPromise;
  accountId: string;
  source: string;
}) {
  const all = await histories;
  if (!all) {
    return <HistoryNote>Bookie couldn&apos;t read the balance history from {source}.</HistoryNote>;
  }
  const history = historyFor(all, accountId);
  if (!history || history.points.length < 2) {
    return (
      <HistoryNote>
        {all.note ?? `Balance history isn't available from ${source} for this account.`}
      </HistoryNote>
    );
  }
  const first = history.points[0];
  const last = history.points[history.points.length - 1];
  const readAt = readAtLabel(all.readAt);
  return (
    <div data-testid="balance-history">
      <BalanceChart points={history.points} currency={history.currency} />
      <p className="text-faint mt-1 flex justify-between gap-2 text-[11px]" aria-hidden>
        <span>{shortDate(first.date)}</span>
        <span>
          {history.interval === 'week' ? 'Weekly, last' : 'Last'} {WEEKS} weeks
          {readAt ? `, ${readAt}` : ''}
        </span>
        <span>{shortDate(last.date)}</span>
      </p>
      <p className="sr-only">{historySummary(history)}</p>
    </div>
  );
}

/**
 * The balance-over-time strip on a bank account card. `histories` is undefined
 * when the source has no balance history at all (BC without the Bookie extension).
 */
export function BankCardHistory({
  histories,
  accountId,
  source,
}: {
  histories?: HistoriesPromise;
  accountId: string;
  source: string;
}) {
  if (!histories) {
    return <HistoryNote>Balance history isn&apos;t available from {source}.</HistoryNote>;
  }
  return (
    <Suspense
      fallback={
        <div className="bg-surface-2/60 h-[72px] animate-pulse rounded-md" role="status">
          <span className="sr-only">Loading balance history</span>
        </div>
      }
    >
      <LoadedHistory histories={histories} accountId={accountId} source={source} />
    </Suspense>
  );
}

/**
 * When the bank feed last brought in data, only as the source reports it, and
 * that Bookie reads the books live. The page load time is never shown as a sync.
 */
export function BankFreshness({
  account,
  source,
  feedNote,
}: {
  account: Pick<BankAccount, 'feedDate'>;
  source: string;
  feedNote?: string;
}) {
  return (
    <div className="text-faint space-y-0.5 text-xs">
      <p data-testid="bank-feed">
        {account.feedDate ? (
          <>
            Bank feed: last statement line{' '}
            <span className="text-muted">{formatDate(account.feedDate)}</span>
          </>
        ) : (
          <span title={feedNote} className={feedNote ? 'cursor-help' : undefined}>
            Feed status not available
            {feedNote && <span className="sr-only">: {feedNote}</span>}
          </span>
        )}
      </p>
      <p data-testid="read-live">Read live from {source} just now</p>
    </div>
  );
}
