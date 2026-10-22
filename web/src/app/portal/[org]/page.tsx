import { Suspense } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink, Landmark, TrendingUp } from 'lucide-react';
import { getAuthContext } from '@/lib/auth/context';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorPanel } from '@/components/ui/States';
import { BookieInsights } from '@/components/bookie/BookieInsights';
import { OrgActivity } from '@/components/home/OrgActivity';
import { ActivityChartSkeleton } from '@/components/home/ActivityChart';
import {
  BankAccountCard,
  DocumentsCard,
  ProfitAndLossTile,
} from '@/components/dashboard/DashboardCards';
import { IncomeExpensesChart } from '@/components/dashboard/IncomeExpensesChart';
import { SourceNote } from '@/components/accounting/SourceNote';
import { LiveFeed } from '@/components/dashboard/LiveFeed';
import { listOrgs } from '@/lib/connectors/registry';
import { liveFeedEnabled } from '@/lib/webhooks/live';
import { walletsForOrg } from '@/lib/bitcoin/wallets';
import { BitcoinWalletCard } from '@/components/bitcoin/BitcoinWalletCard';

export const metadata = { title: 'Home' };

function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' })
      .format(now)
      .slice(0, 2)
  );
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export default async function Home({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { org, connector, base, modules } = await orgContext(orgParam);
  const auth = await getAuthContext();
  const firstName = auth?.user.name.split(/\s+/)[0];

  // Wallets are read alongside the dashboard, not after it: they don't depend on it.
  const [details, dashboard, walletRead] = await Promise.allSettled([
    connector.organisation(),
    connector.dashboard(),
    auth ? walletsForOrg(auth, { org, connector }) : Promise.resolve(undefined),
  ]);
  const orgDetails = details.status === 'fulfilled' ? details.value : undefined;
  // Bank balance histories: read once for every card, after the dashboard's own calls
  // (Xero allows five at once), and streamed in. Not read when there are no bank cards.
  const histories =
    dashboard.status === 'fulfilled' && dashboard.value.bankAccounts.length
      ? connector.bank?.balanceHistory?.().catch(() => undefined)
      : undefined;
  // Bitcoin wallets sit with the bank accounts, as on Accounting › Bank accounts. If they
  // can't be read (settings store or BC down), Home still shows the bank accounts.
  if (walletRead.status === 'rejected') {
    console.error('[bookie] bitcoin wallets unavailable on Home', walletRead.reason);
  }
  const wallets = walletRead.status === 'fulfilled' ? walletRead.value : undefined;
  // Valued in the organisation's base currency, from the details already read above.
  const walletCurrency = wallets?.wallets.length ? orgDetails?.baseCurrency : undefined;
  // The Live panel only shows when the source can push webhooks here (feature flag).
  const live = auth ? liveFeedEnabled(org, (await listOrgs(auth)).settings) : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-muted text-sm">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </p>
          <h1 className="text-ink mt-1 truncate text-3xl font-bold tracking-tight">
            {orgDetails?.name ?? org.name}
          </h1>
          <p className="text-faint mt-1 text-sm">{org.sourceLabel}</p>
        </div>
        {orgDetails?.sourceUrl && (
          <ButtonLink href={orgDetails.sourceUrl} variant="secondary" size="sm">
            Open in {sourceName(org)} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </ButtonLink>
        )}
      </div>

      <Suspense fallback={<ActivityChartSkeleton />}>
        <OrgActivity orgParam={orgParam} />
      </Suspense>

      <BookieInsights orgKey={org.key} />

      {live && (
        <LiveFeed
          orgKey={org.key}
          sourceLabel={sourceName(org)}
          renewBc={org.kind === 'business-central'}
        />
      )}

      {dashboard.status === 'rejected' ? (
        <ErrorPanel
          title="We couldn't load your dashboard"
          message={
            isConnectorError(dashboard.reason)
              ? dashboard.reason.message
              : `Bookie could not reach ${sourceName(org)}. Try again in a moment.`
          }
        />
      ) : (
        (() => {
          const d = dashboard.value;
          return (
            <>
              {!d.currency && (
                <SourceNote>
                  {sourceName(org)} doesn&apos;t say what this organisation&apos;s base currency is,
                  so amounts are shown without a currency symbol.
                </SourceNote>
              )}
              <section aria-labelledby="bank-heading">
                <h2 id="bank-heading" className="text-ink mb-3 text-[15px] font-semibold">
                  Bank accounts
                </h2>
                {d.bankAccounts.length || wallets?.wallets.length ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {d.bankAccounts.map((account) => (
                      <BankAccountCard
                        key={account.id}
                        account={account}
                        href={
                          modules.bank
                            ? `${base}/accounting/bank/${encodeURIComponent(account.id)}`
                            : undefined
                        }
                        histories={histories}
                        source={org.kind === 'demo' ? 'the demo books' : sourceName(org)}
                        feedNote={connector.bank?.feedNote}
                      />
                    ))}
                    {auth &&
                      wallets?.wallets.map((wallet) => (
                        <BitcoinWalletCard
                          key={`btc-${wallet.id}`}
                          auth={auth}
                          scope={{ org, connector }}
                          currency={walletCurrency}
                          wallet={wallet}
                          href={`${base}/accounting/bank/bitcoin/${encodeURIComponent(wallet.id)}`}
                        />
                      ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Landmark className="h-6 w-6" />}
                    title={
                      d.notes?.bank ? "Bank accounts aren't available" : 'No bank accounts to show'
                    }
                    body={
                      d.notes?.bank ??
                      `${sourceName(org)} didn't return any bank accounts for this organisation.`
                    }
                  />
                )}
                {modules.bank && modules.invoices && (
                  <Link
                    href={`${base}/reporting/cash-flow-forecast`}
                    className="border-line hover:border-brand/40 hover:bg-surface-2 group mt-4 flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors"
                    data-testid="home-forecast-link"
                  >
                    <TrendingUp className="text-brand-bright h-4 w-4 shrink-0" aria-hidden />
                    <span className="text-ink font-medium">Cash flow forecast</span>
                    <span className="text-muted hidden sm:inline">
                      Where these balances are heading, from your unpaid invoices and bills
                    </span>
                    <ChevronRight
                      className="text-faint group-hover:text-brand-bright ml-auto h-4 w-4"
                      aria-hidden
                    />
                  </Link>
                )}
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <DocumentsCard
                  title="Invoices owed to you"
                  noun="invoice"
                  buckets={d.receivables}
                  currency={d.currency}
                  note={d.notes?.receivables}
                  listHref={modules.invoices ? `${base}/sales/invoices` : undefined}
                  newHref={connector.invoices?.create ? `${base}/sales/invoices/new` : undefined}
                  newLabel="New invoice"
                />
                <DocumentsCard
                  title="Bills to pay"
                  noun="bill"
                  buckets={d.payables}
                  currency={d.currency}
                  note={d.notes?.payables}
                  listHref={modules.invoices ? `${base}/purchases/bills` : undefined}
                  newHref={connector.invoices?.create ? `${base}/purchases/bills/new` : undefined}
                  newLabel="New bill"
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader title="Income and expenses" subtitle="Last 12 months" />
                  <div className="px-5 py-4">
                    {d.notes?.trend ? (
                      <p className="text-muted py-10 text-center text-sm" role="note">
                        {d.notes.trend}
                      </p>
                    ) : (
                      <IncomeExpensesChart trend={d.trend} currency={d.currency} />
                    )}
                  </div>
                </Card>
                {d.profitAndLoss ? (
                  <ProfitAndLossTile
                    pl={d.profitAndLoss}
                    currency={d.currency}
                    href={
                      modules.reports
                        ? `${base}/reporting/profit-and-loss?from=${d.profitAndLoss.from}&to=${d.profitAndLoss.to}`
                        : undefined
                    }
                  />
                ) : (
                  <EmptyState
                    title="Profit and loss isn't available"
                    body={
                      d.notes?.profitAndLoss ??
                      `${sourceName(org)} didn't return a profit and loss for this financial year.`
                    }
                  />
                )}
              </div>
            </>
          );
        })()
      )}
    </div>
  );
}
