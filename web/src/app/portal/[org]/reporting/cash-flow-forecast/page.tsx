import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Clock3,
  Landmark,
  TrendingDown,
} from 'lucide-react';
import { requireAuth } from '@/lib/auth/context';
import { isConnectorError } from '@/lib/connectors/types';
import { orgContext, sourceName } from '@/lib/portal/context';
import { loadPlannedItems } from '@/lib/forecast/planned';
import { ForecastUnavailableError, loadForecast } from '@/lib/forecast/load';
import {
  FORECAST_HORIZONS,
  HORIZON_LABELS,
  type Forecast,
  type ForecastHorizon,
  type ProjectionMonths,
} from '@/lib/forecast/types';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorPanel, NotAvailable } from '@/components/ui/States';
import { NotAvailableValue } from '@/components/ui/Money';
import { SourceNote } from '@/components/accounting/SourceNote';
import { ForecastChart } from '@/components/forecast/ForecastChart';
import { ForecastControls } from '@/components/forecast/ForecastControls';
import { ForecastExport } from '@/components/forecast/ForecastExport';
import { EntryList, ForecastTable } from '@/components/forecast/ForecastTable';
import { ForecastLegend, LayerSwatch } from '@/components/forecast/legend';
import { PlannedItems } from '@/components/forecast/PlannedItems';

export const metadata = { title: 'Cash flow forecast' };

type Search = {
  horizon?: string;
  currency?: string;
  drafts?: string;
  projection?: string;
  pipeline?: string;
};

function Tile({
  icon,
  label,
  value,
  children,
  testId,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
  testId?: string;
  tone?: 'warn' | 'danger';
}) {
  return (
    <Card className="p-4" data-testid={testId}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'bg-surface-2 text-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            tone === 'warn' && 'bg-warn/10 text-warn',
            tone === 'danger' && 'bg-danger/10 text-danger'
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted text-sm">{label}</p>
          <p className="text-ink mt-0.5 truncate text-2xl font-semibold tracking-tight">{value}</p>
          {children && <div className="text-muted mt-2 space-y-0.5 text-xs">{children}</div>}
        </div>
      </div>
    </Card>
  );
}

function Breakdown({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: number;
  currency: string;
}) {
  return (
    <p className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="num text-body">{formatMoney(amount, currency)}</span>
    </p>
  );
}

function flowTiles(f: Forecast) {
  const t = f.totals;
  const sum = (dir: 'In' | 'Out') =>
    t[`known${dir}`] +
    t[`planned${dir}`] +
    (f.layers.drafts ? t[`draft${dir}`] : 0) +
    (f.layers.projected ? t[`projected${dir}`] : 0) +
    (f.layers.pipeline && dir === 'In' ? t.pipelineIn : 0);
  return { in: Math.round(sum('In') * 100) / 100, out: Math.round(sum('Out') * 100) / 100 };
}

export default async function CashFlowForecastPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ org: orgParam }, search] = await Promise.all([params, searchParams]);
  const { org, connector, base } = await orgContext(orgParam);
  const source = sourceName(org);
  if (!connector.bank || !connector.invoices) {
    return <NotAvailable feature="Cash flow forecast" source={source} />;
  }
  const auth = await requireAuth(`${base}/reporting/cash-flow-forecast`);

  const horizon: ForecastHorizon = FORECAST_HORIZONS.includes(search.horizon as ForecastHorizon)
    ? (search.horizon as ForecastHorizon)
    : '13w';
  const includeDrafts = search.drafts === '1';
  const includePipeline = search.pipeline === '1';
  const projectionMonths = (
    ['3', '6', '12'].includes(search.projection ?? '') ? Number(search.projection) : undefined
  ) as ProjectionMonths | undefined;

  const header = (actions?: React.ReactNode, meta?: React.ReactNode) => (
    <PageHeader
      title="Cash flow forecast"
      crumbs={[{ label: 'Reporting', href: `${base}/reporting` }, { label: 'Cash flow forecast' }]}
      meta={meta ?? org.name}
      actions={actions}
    />
  );

  const planned = await loadPlannedItems(auth, org.key);
  let result;
  try {
    result = await loadForecast(
      connector,
      planned,
      { horizon, currency: search.currency, includeDrafts, projectionMonths, includePipeline },
      source
    );
  } catch (error) {
    if (error instanceof ForecastUnavailableError) {
      return (
        <>
          {header()}
          <EmptyState title="A forecast isn't available" body={error.message} />
        </>
      );
    }
    return (
      <>
        {header()}
        <ErrorPanel
          title="We couldn't build the forecast"
          message={
            isConnectorError(error)
              ? error.message
              : `Bookie could not reach ${source}. Try again in a moment.`
          }
        />
      </>
    );
  }

  const f = result.forecast;
  const currency = f.currency;
  const flows = flowTiles(f);
  const unit = f.horizon === '13w' ? 'week' : 'month';
  const storedIn =
    auth.mode === 'demo'
      ? 'this demo session'
      : process.env.BOOKIE_CONFIG_STORE === 'file'
        ? "Bookie's local settings file"
        : "your own SharePoint, sealed with Bookie's settings";
  const overdueTotal = f.overdue.in.count + f.overdue.out.count;
  const notIncluded =
    f.opening.excluded.length +
    f.unknownAmount.length +
    f.noDueDate.length +
    f.afterHorizon.count +
    result.notes.length;

  return (
    <div className="space-y-6">
      {header(
        <ForecastExport forecast={f} orgName={org.name} />,
        <>
          {org.name}: {HORIZON_LABELS[f.horizon]} from today, {formatDate(f.today)}, to{' '}
          {formatDate(f.end)}, in {currency || 'an unknown currency'}
        </>
      )}

      <Card className="px-5 py-4">
        <ForecastControls
          horizon={horizon}
          currency={currency}
          currencies={result.currencies}
          drafts={includeDrafts}
          projectionMonths={result.projection.available ? projectionMonths : undefined}
          pipeline={result.pipeline}
          includePipeline={f.layers.pipeline}
          projection={result.projection}
        />
      </Card>

      {f.opening.balance === undefined && (
        <SourceNote>
          No {currency} bank account has a balance Bookie can read from {source}, so there&apos;s no
          opening balance and no running balance. The money in and out below is still accurate.
        </SourceNote>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={<Landmark className="h-4.5 w-4.5" aria-hidden />}
          label="Cash in the bank today"
          testId="forecast-opening"
          value={
            f.opening.balance === undefined ? (
              <NotAvailableValue reason={`No ${currency} account balance from ${source}.`} />
            ) : (
              formatMoney(f.opening.balance, currency)
            )
          }
        >
          <p>
            From {f.opening.accounts.length} bank account
            {f.opening.accounts.length === 1 ? '' : 's'} in {source}
          </p>
          {f.opening.excluded.length > 0 && (
            <p className="text-warn">
              {f.opening.excluded.length} account{f.opening.excluded.length === 1 ? '' : 's'} not
              included:{' '}
              <a href="#not-included" className="underline">
                see why
              </a>
            </p>
          )}
        </Tile>
        <Tile
          icon={<ArrowDownLeft className="h-4.5 w-4.5" aria-hidden />}
          label={`Coming in, next ${HORIZON_LABELS[f.horizon]}`}
          value={formatMoney(flows.in, currency)}
          testId="forecast-in"
        >
          <Breakdown
            label="Known (approved invoices)"
            amount={f.totals.knownIn}
            currency={currency}
          />
          <Breakdown
            label="Planned (you entered this)"
            amount={f.totals.plannedIn}
            currency={currency}
          />
          {f.layers.drafts && (
            <Breakdown label="Drafts" amount={f.totals.draftIn} currency={currency} />
          )}
          {f.layers.pipeline && (
            <Breakdown
              label="Pipeline (weighted)"
              amount={f.totals.pipelineIn}
              currency={currency}
            />
          )}
          {f.layers.projected && (
            <Breakdown label="Projection" amount={f.totals.projectedIn} currency={currency} />
          )}
        </Tile>
        <Tile
          icon={<ArrowUpRight className="h-4.5 w-4.5" aria-hidden />}
          label={`Going out, next ${HORIZON_LABELS[f.horizon]}`}
          value={formatMoney(flows.out, currency)}
          testId="forecast-out"
        >
          <Breakdown
            label="Known (approved bills)"
            amount={f.totals.knownOut}
            currency={currency}
          />
          <Breakdown
            label="Planned (you entered this)"
            amount={f.totals.plannedOut}
            currency={currency}
          />
          {f.layers.drafts && (
            <Breakdown label="Drafts" amount={f.totals.draftOut} currency={currency} />
          )}
          {f.layers.projected && (
            <Breakdown label="Projection" amount={f.totals.projectedOut} currency={currency} />
          )}
        </Tile>
        <Tile
          icon={<TrendingDown className="h-4.5 w-4.5" aria-hidden />}
          label="Lowest balance"
          testId="forecast-lowest-tile"
          tone={f.lowest ? (f.lowest.belowZero ? 'danger' : 'warn') : undefined}
          value={
            f.lowest ? (
              <span className={cn(f.lowest.belowZero && 'text-danger')}>
                {formatMoney(f.lowest.balance, currency)}
              </span>
            ) : (
              <NotAvailableValue reason="There's no opening balance to start from." />
            )
          }
        >
          {f.lowest && (
            <p>
              At the end of the {f.lowest.label.replace(/^Week of/, 'week of')}
              {f.lowest.belowZero ? ': below zero' : ''}
            </p>
          )}
          <p>
            Closing balance{' '}
            <span className="num text-body">
              {f.closing === undefined ? '—' : formatMoney(f.closing, currency)}
            </span>{' '}
            on {formatDate(f.end)}
          </p>
        </Tile>
      </div>

      <Card>
        <CardHeader
          title="Balance and cash movements"
          subtitle={`Per ${unit}. Running balance from the layers that are switched on.`}
          action={
            f.lowest && (
              <p
                data-testid="forecast-lowest"
                className={cn(
                  'flex min-w-0 flex-wrap items-center gap-x-1.5 rounded-lg border px-3 py-1 text-sm',
                  f.lowest.belowZero
                    ? 'border-danger/40 bg-danger/10 text-danger'
                    : 'border-warn/40 bg-warn/10 text-warn'
                )}
              >
                {f.lowest.belowZero && <AlertTriangle className="h-4 w-4" aria-hidden />}
                Lowest balance{' '}
                <span className="num font-semibold">
                  {formatMoney(f.lowest.balance, currency)}
                </span>{' '}
                in {f.lowest.label.replace(/^Week of/, 'week of')}
              </p>
            )
          }
        />
        <div className="space-y-4 px-5 py-4">
          <ForecastChart forecast={f} />
          <ForecastLegend forecast={f} />
        </div>
      </Card>

      <Card
        className={cn(overdueTotal > 0 && 'border-l-warn border-l-4')}
        data-testid="forecast-overdue"
      >
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Clock3 className="text-warn h-4 w-4" aria-hidden />
              Overdue: timing unknown
            </span>
          }
          subtitle="Approved invoices and bills already past their due date. They aren't placed on any date or counted in the balances above, because when they'll be paid isn't known."
        />
        <div className="grid gap-px sm:grid-cols-2">
          {(['in', 'out'] as const).map((d) => {
            const band = f.overdue[d];
            const href =
              d === 'in'
                ? `${base}/sales/invoices?status=overdue`
                : `${base}/purchases/bills?status=overdue`;
            return (
              <div key={d} className="px-5 py-4">
                <p className="text-muted text-sm">{d === 'in' ? 'Owed to you' : 'You owe'}</p>
                <p className="text-ink num mt-0.5 text-xl font-semibold">
                  {formatMoney(band.total, currency)}
                </p>
                <p className="text-muted mt-1 flex items-center justify-between gap-3 text-xs">
                  <span>
                    {band.count} {d === 'in' ? 'invoice' : 'bill'}
                    {band.count === 1 ? '' : 's'} in {currency}
                  </span>
                  {band.count > 0 && (
                    <Link
                      href={href}
                      className="text-brand-bright flex items-center gap-0.5 hover:underline"
                    >
                      View overdue {d === 'in' ? 'invoices' : 'bills'}
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Breakdown"
          subtitle="Select a figure to see the invoices, bills, planned items or opportunities behind it. Money out is shown as negative."
        />
        <ForecastTable forecast={f} base={base} />
      </Card>

      <PlannedItems
        orgKey={org.key}
        items={planned}
        currencies={result.currencies.length ? result.currencies : [currency]}
        currency={currency}
        today={f.today}
        storedIn={storedIn}
      />

      {f.layers.pipeline && f.pipelineExcluded.length > 0 && (
        <Card data-testid="forecast-pipeline-excluded">
          <CardHeader
            title="Not in the pipeline"
            subtitle={`Open opportunities Bookie can't place. Fill in what's missing in ${source} to include them.`}
          />
          <ul className="text-muted space-y-2 px-5 py-4 text-sm">
            {f.pipelineExcluded.map((item) => (
              <li key={item.number}>
                <span className="text-body">{item.label}</span>: {item.reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {notIncluded > 0 && (
        <Card id="not-included" data-testid="forecast-not-included">
          <CardHeader
            title="Not included in this forecast"
            subtitle="Bookie never estimates a figure the source doesn't give. These are listed, not added."
          />
          <div className="divide-line divide-y">
            {f.opening.excluded.length > 0 && (
              <section className="px-5 py-4">
                <h3 className="text-ink mb-2 text-sm font-semibold">
                  Bank accounts left out of the opening balance
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {f.opening.excluded.map((a) => (
                    <li key={a.id}>
                      <span className="text-ink">{a.name}</span>
                      <span className="text-muted">: {a.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {f.unknownAmount.length > 0 && (
              <section className="px-5 py-4" data-testid="forecast-unknown-amount">
                <h3 className="text-ink mb-1 text-sm font-semibold">
                  Amount not available ({f.unknownAmount.length})
                </h3>
                <p className="text-muted mb-2 text-sm">
                  {source} doesn&apos;t report what&apos;s left to pay on these, so they aren&apos;t
                  added anywhere.
                </p>
                <EntryList entries={f.unknownAmount} currency={currency} base={base} />
              </section>
            )}
            {f.noDueDate.length > 0 && (
              <section className="px-5 py-4">
                <h3 className="text-ink mb-1 text-sm font-semibold">
                  No usable due date ({f.noDueDate.length})
                </h3>
                <p className="text-muted mb-2 text-sm">
                  No due date from {source}, or a draft whose due date has already passed.
                </p>
                <EntryList entries={f.noDueDate} currency={currency} base={base} />
              </section>
            )}
            {f.afterHorizon.count > 0 && (
              <section className="text-muted px-5 py-4 text-sm">
                <h3 className="text-ink mb-1 font-semibold">Due after {formatDate(f.end)}</h3>
                {f.afterHorizon.count} document{f.afterHorizon.count === 1 ? '' : 's'}:{' '}
                {formatMoney(f.afterHorizon.in, currency)} in and{' '}
                {formatMoney(f.afterHorizon.out, currency)} out. Choose a longer horizon to see
                them.
              </section>
            )}
            {result.notes.map((note) => (
              <p key={note} className="text-muted px-5 py-4 text-sm">
                {note}
              </p>
            ))}
          </div>
        </Card>
      )}

      <section
        className="text-faint grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4"
        aria-label="How this forecast is built"
      >
        <p className="flex gap-2">
          <LayerSwatch layer="known" className="mt-0.5" />
          <span>
            <span className="text-muted">Known</span>: approved invoices and bills in {source}, by
            due date, at what&apos;s left to pay.
          </span>
        </p>
        <p className="flex gap-2">
          <LayerSwatch layer="draft" className="mt-0.5" />
          <span>
            <span className="text-muted">Drafts and awaiting approval</span>: off unless you switch
            them on.
          </span>
        </p>
        <p className="flex gap-2">
          <LayerSwatch layer="planned" className="mt-0.5" />
          <span>
            <span className="text-muted">Planned</span>: the items you entered below. Your
            assumptions, kept apart from Known.
          </span>
        </p>
        <p className="flex gap-2">
          <LayerSwatch layer="projected" className="mt-0.5" />
          <span>
            <span className="text-muted">Projection</span>: off unless you switch it on. The monthly
            average of bank spending and income that wasn&apos;t an invoice or bill payment.
          </span>
        </p>
      </section>
    </div>
  );
}
