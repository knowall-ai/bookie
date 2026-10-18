import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bitcoin } from 'lucide-react';
import { requireAuth, type AuthContext } from '@/lib/auth/context';
import { loadReconcile, type ReconcileScope } from '@/lib/bitcoin/reconcile-service';
import { cn } from '@/lib/ui/cn';
import { ReconcilePanel } from '@/components/bitcoin/ReconcilePanel';
import { WalletError } from '@/lib/bitcoin/errors';
import { shortTxid } from '@/lib/bitcoin/format';
import {
  loadWallet,
  valueBalance,
  valueTransactions,
  type WalletTransactionRow,
} from '@/lib/bitcoin/wallets';
import { orgContext } from '@/lib/portal/context';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { NotAvailableValue } from '@/components/ui/Money';
import { SourceNote } from '@/components/accounting/SourceNote';
import { BtcAmount, GbpValueView } from '@/components/bitcoin/BitcoinParts';

export const metadata = { title: 'Bitcoin wallet' };

const PAGE_SIZE = 50;

const columns: Column<WalletTransactionRow>[] = [
  {
    key: 'date',
    header: 'Date',
    cell: (t) =>
      t.pending ? (
        <Badge tone="amber">Pending</Badge>
      ) : (
        <span title={t.blockTime ? new Date(t.blockTime * 1000).toISOString() : undefined}>
          {formatDate(t.date)}
        </span>
      ),
  },
  {
    key: 'txid',
    header: 'Transaction',
    cell: (t) => (
      <span className="flex flex-col">
        <span className="text-ink font-mono text-xs" title={t.txid}>
          {shortTxid(t.txid)}
        </span>
        <span className="text-faint text-xs">
          {t.direction === 'in'
            ? 'Received'
            : t.direction === 'self'
              ? 'Moved within the wallet'
              : 'Sent'}
        </span>
      </span>
    ),
  },
  {
    key: 'confirmations',
    header: 'Confirmations',
    align: 'right',
    hideOnMobile: true,
    cell: (t) =>
      t.pending ? (
        <span className="text-warn">0</span>
      ) : (
        <span className="num">{t.confirmations.toLocaleString('en-GB')}</span>
      ),
  },
  {
    key: 'fee',
    header: 'Fee',
    align: 'right',
    hideOnMobile: true,
    cell: (t) =>
      t.feeSats !== undefined ? (
        <BtcAmount sats={t.feeSats} className="text-muted" />
      ) : (
        <NotAvailableValue
          reason={
            t.sentSats === 0
              ? 'The sender paid this fee, not this wallet.'
              : 'Not every input of this transaction could be read.'
          }
        />
      ),
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    cell: (t) => <BtcAmount sats={t.netSats} sign colour />,
  },
  {
    key: 'gbp',
    header: 'Value in GBP',
    align: 'right',
    cell: (t) => <GbpValueView value={t.gbp} />,
  },
];

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; walletId: string }>;
  searchParams: Promise<{ page?: string; tab?: string }>;
}) {
  const [{ org: orgParam, walletId: rawId }, query] = await Promise.all([params, searchParams]);
  const { base, org, connector } = await orgContext(orgParam);
  const walletId = decodeURIComponent(rawId);
  const auth = await requireAuth(`/portal/${orgParam}/accounting/bank`);
  const { wallet, load } = await loadWallet(auth, { org, connector }, walletId).catch((error) => {
    if (error instanceof WalletError && error.status === 404) notFound();
    throw error;
  });

  const crumbs = [
    { label: 'Accounting', href: `${base}/accounting` },
    { label: 'Bank accounts', href: `${base}/accounting/bank` },
  ];
  const header = (meta?: React.ReactNode) => (
    <PageHeader
      title={wallet.name}
      crumbs={crumbs}
      meta={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>{wallet.typeLabel}</span>
          {wallet.bcBankAccountNumber && <span>BC bank account {wallet.bcBankAccountNumber}</span>}
          {wallet.source === 'business-central' && wallet.currencyCode !== 'BTC' && (
            <Badge tone="amber">
              Currency in Business Central: {wallet.currencyCode || 'the company’s local currency'},
              not BTC
            </Badge>
          )}
          {wallet.demo && <Badge>Demo data (fictional)</Badge>}
          {meta}
        </span>
      }
    />
  );

  if (load.status !== 'ok') {
    return (
      <>
        {header()}
        <div data-testid="wallet-unavailable">
          <EmptyState
            icon={<Bitcoin className="h-6 w-6" />}
            title={load.message}
            body={
              load.status === 'not-configured'
                ? 'Bookie reads Bitcoin wallets through an Electrum server. Ask whoever runs this Bookie installation to set BOOKIE_ELECTRUM_URL (see docs/BITCOIN.adoc).'
                : wallet.problem
                  ? 'Correct the descriptor on the bank account card in Business Central, then reload.'
                  : 'Bookie shows nothing rather than a partial or stale wallet. Try again in a minute.'
            }
          />
        </div>
      </>
    );
  }

  const { scan, source } = load;
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const slice = scan.transactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const listPath = `${base}/accounting/bank/bitcoin/${encodeURIComponent(wallet.id)}`;
  // Reconcile against the BC bank account (or the demo's fictional one).
  const canReconcile =
    (org.kind === 'business-central' || org.kind === 'demo') &&
    !!wallet.bcBankAccountNumber &&
    !!connector.bitcoin?.ledger;
  const tab = query.tab === 'reconcile' && canReconcile ? 'reconcile' : 'transactions';
  // The Reconcile tab shows BTC only, so it doesn't ask Kraken for prices.
  const [rows, balanceGbp] =
    tab === 'reconcile'
      ? [[], { ok: false as const, reason: '' }]
      : await Promise.all([
          valueTransactions(slice, source),
          valueBalance(scan.balance.confirmedSats, source),
        ]);

  return (
    <>
      {header(
        <span>
          Read {source === 'demo' ? 'from demo fixtures' : 'live from the blockchain'} at block{' '}
          {scan.tip.height.toLocaleString('en-GB')}
        </span>
      )}

      {load.electrum?.privacyWarning && (
        <SourceNote>
          This wallet is read through an Electrum server that this Bookie installation’s operator
          hasn’t marked as their own. That server learns every address in the wallet.
        </SourceNote>
      )}
      {!wallet.hasChange && (
        <SourceNote>
          This descriptor has one chain, so change addresses aren’t included. Add the wallet with a
          descriptor ending in /&lt;0;1&gt;/* to include them.
        </SourceNote>
      )}

      {canReconcile && <WalletTabs listPath={listPath} current={tab} />}
      {tab === 'reconcile' && canReconcile ? (
        <ReconcileTab
          auth={auth}
          scope={{ org, connector }}
          orgKey={org.key}
          walletId={wallet.id}
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3" data-testid="wallet-summary">
            <div className="card px-5 py-4">
              <p className="text-faint text-xs font-semibold tracking-wide uppercase">
                Confirmed balance
              </p>
              <p className="text-ink mt-1 text-xl font-semibold">
                <BtcAmount sats={scan.balance.confirmedSats} />
              </p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-faint text-xs font-semibold tracking-wide uppercase">Pending</p>
              <p className="text-ink mt-1 text-xl font-semibold">
                <BtcAmount sats={scan.balance.pendingSats} sign />
              </p>
              <p className="text-faint text-xs">Unconfirmed: not settled until mined</p>
            </div>
            <div className="card px-5 py-4">
              <p className="text-faint text-xs font-semibold tracking-wide uppercase">
                Confirmed balance in GBP
              </p>
              <p className="text-ink mt-1 text-xl font-semibold">
                <GbpValueView value={balanceGbp} className="items-start" />
              </p>
            </div>
          </div>

          <SourceNote>
            {source === 'demo'
              ? 'Demo organisation: the transactions and prices are fictional.'
              : 'GBP values come from Kraken (XBTGBP): the daily close of the UTC day the block was mined, or the first Kraken trade after the block time when that day has not closed or is older than Kraken’s daily history. Each figure says which. Pending transactions have no value until they are mined.'}
          </SourceNote>

          <p className="text-muted mb-3 text-sm" aria-live="polite">
            {scan.transactions.length}{' '}
            {scan.transactions.length === 1 ? 'transaction' : 'transactions'} · {scan.used.receive}{' '}
            receive and {scan.used.change} change addresses used
          </p>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(t) => t.txid}
            empty={
              <EmptyState
                icon={<Bitcoin className="h-6 w-6" />}
                title="No transactions yet"
                body="Bookie looked at the first 20 unused addresses on each chain and found no history."
              />
            }
          />
          <Pagination
            page={page}
            hasMore={scan.transactions.length > page * PAGE_SIZE}
            basePath={listPath}
          />
        </>
      )}
    </>
  );
}

function WalletTabs({
  listPath,
  current,
}: {
  listPath: string;
  current: 'transactions' | 'reconcile';
}) {
  const tabs = [
    { value: 'transactions', label: 'Transactions', href: listPath },
    { value: 'reconcile', label: 'Reconcile', href: `${listPath}?tab=reconcile` },
  ] as const;
  return (
    <div role="tablist" className="border-line mb-6 flex gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.value}
          role="tab"
          aria-selected={current === t.value}
          href={t.href}
          className={cn(
            '-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
            current === t.value
              ? 'border-brand text-ink font-semibold'
              : 'text-muted hover:text-ink border-transparent'
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

async function ReconcileTab({
  auth,
  scope,
  orgKey,
  walletId,
}: {
  auth: AuthContext;
  scope: ReconcileScope;
  orgKey: string;
  walletId: string;
}) {
  const [{ view }, accounts] = await Promise.all([
    loadReconcile(auth, scope, walletId),
    scope.connector.accounts?.list().catch(() => []) ?? Promise.resolve([]),
  ]);
  return (
    <ReconcilePanel
      view={view}
      orgKey={orgKey}
      walletId={walletId}
      accounts={accounts
        .filter((a) => !a.isBank && a.status !== 'archived')
        .map((a) => ({ code: a.code, name: a.name }))}
    />
  );
}
