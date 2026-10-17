import { ExternalLink, Landmark } from 'lucide-react';
import { getAuthContext } from '@/lib/auth/context';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorPanel } from '@/components/ui/States';
import { BookieInsights } from '@/components/bookie/BookieInsights';
import {
  BankAccountCard,
  DocumentsCard,
  ProfitAndLossTile,
} from '@/components/dashboard/DashboardCards';
import { IncomeExpensesChart } from '@/components/dashboard/IncomeExpensesChart';

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

  const [details, dashboard] = await Promise.allSettled([
    connector.organisation(),
    connector.dashboard(),
  ]);
  const orgDetails = details.status === 'fulfilled' ? details.value : undefined;

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

      <BookieInsights orgKey={org.key} />

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
              <section aria-labelledby="bank-heading">
                <h2 id="bank-heading" className="text-ink mb-3 text-[15px] font-semibold">
                  Bank accounts
                </h2>
                {d.bankAccounts.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {d.bankAccounts.map((account) => (
                      <BankAccountCard
                        key={account.id}
                        account={{ ...account, currency: account.currency || d.currency }}
                        href={
                          modules.bank
                            ? `${base}/accounting/bank/${encodeURIComponent(account.id)}`
                            : undefined
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<Landmark className="h-6 w-6" />}
                    title="No bank accounts to show"
                    body={`${sourceName(org)} didn't return any bank accounts for this organisation.`}
                  />
                )}
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <DocumentsCard
                  title="Invoices owed to you"
                  noun="invoice"
                  buckets={d.receivables}
                  currency={d.currency}
                  listHref={modules.invoices ? `${base}/sales/invoices` : undefined}
                  newHref={connector.invoices?.create ? `${base}/sales/invoices/new` : undefined}
                  newLabel="New invoice"
                />
                <DocumentsCard
                  title="Bills to pay"
                  noun="bill"
                  buckets={d.payables}
                  currency={d.currency}
                  listHref={modules.invoices ? `${base}/purchases/bills` : undefined}
                  newHref={connector.invoices?.create ? `${base}/purchases/bills/new` : undefined}
                  newLabel="New bill"
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader title="Income and expenses" subtitle="Last 12 months" />
                  <div className="px-5 py-4">
                    <IncomeExpensesChart trend={d.trend} currency={d.currency} />
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
                    body={`${sourceName(org)} didn't return a profit and loss for this financial year.`}
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
