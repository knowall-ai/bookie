'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { Forecast, ForecastBucket, ForecastEntry, ForecastLayer } from '@/lib/forecast/types';
import { balanceTicks, niceTicks } from '@/lib/forecast/axis';
import { formatDate, formatMoney, formatMoneyCompact } from '@/lib/ui/format';
import { FLOW, LAYER_NAMES, LayerSwatch, BALANCE_COLOUR } from './legend';

/*
 * Money in (blue) and out (orange) are the validated categorical pair from the
 * home chart (dataviz palette checker on #111827: CVD ΔE 26.8, 3:1 contrast).
 * The layer is the secondary encoding: Known solid, Drafts translucent,
 * Planned outlined, Projected hatched. The running balance is a neutral ink
 * line so it never competes with either flow's identity.
 */

const LAYERS: ForecastLayer[] = ['known', 'draft', 'planned', 'projected'];

interface Point {
  key: string;
  short: string;
  bucket?: ForecastBucket;
  balance?: number;
  knownIn?: number;
  draftIn?: number;
  plannedIn?: number;
  projectedIn?: number;
  knownOut?: number;
  draftOut?: number;
  plannedOut?: number;
  projectedOut?: number;
}

function fillFor(layer: ForecastLayer, direction: 'in' | 'out') {
  const colour = FLOW[direction].colour;
  switch (layer) {
    case 'known':
      return { fill: colour, stroke: 'none', fillOpacity: 1 };
    case 'draft':
      return { fill: colour, stroke: 'none', fillOpacity: 0.42 };
    case 'planned':
      return { fill: colour, stroke: colour, fillOpacity: 0.14 };
    case 'projected':
      return { fill: `url(#hatch-${direction})`, stroke: 'none', fillOpacity: 1 };
  }
}

export function chartPoints(forecast: Forecast): Point[] {
  const on = (layer: ForecastLayer) =>
    layer === 'draft'
      ? forecast.layers.drafts
      : layer === 'projected'
        ? forecast.layers.projected
        : true;
  return [
    { key: 'today', short: 'Today', balance: forecast.opening.balance },
    ...forecast.buckets.map((b) => {
      const p: Point = { key: b.key, short: b.short, bucket: b, balance: b.closing };
      for (const layer of LAYERS) {
        if (!on(layer)) continue;
        const t = b.totals;
        const inKey = `${layer}In` as const;
        const outKey = `${layer}Out` as const;
        p[inKey] = t[inKey] || undefined;
        p[outKey] = t[outKey] ? -t[outKey] : undefined;
      }
      return p;
    }),
  ];
}

const MAX_TOOLTIP_ROWS = 4;

function TooltipLayer({
  layer,
  entries,
  currency,
  projectionLabel,
}: {
  layer: ForecastLayer;
  entries: ForecastEntry[];
  currency: string;
  projectionLabel?: string;
}) {
  if (!entries.length) return null;
  return (
    <div className="border-line border-t pt-1.5 first:border-0 first:pt-0">
      <p className="text-muted mb-1 flex items-center gap-1.5">
        <LayerSwatch layer={layer} direction={entries[0].direction} />
        {layer === 'projected' && projectionLabel ? projectionLabel : LAYER_NAMES[layer]}
      </p>
      {entries.slice(0, MAX_TOOLTIP_ROWS).map((e, i) => (
        <p key={i} className="flex justify-between gap-6 py-0.5">
          <span className="text-body max-w-48 truncate">
            {e.document ? `${e.document.number} · ${e.label}` : e.label}
          </span>
          <span className="num text-ink">
            {formatMoney((e.direction === 'out' ? -1 : 1) * (e.amount ?? 0), currency)}
          </span>
        </p>
      ))}
      {entries.length > MAX_TOOLTIP_ROWS && (
        <p className="text-faint py-0.5">
          and {entries.length - MAX_TOOLTIP_ROWS} more: click the table to see them all
        </p>
      )}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  currency,
  forecast,
  projectionLabel,
}: TooltipContentProps<number, string> & {
  currency: string;
  forecast: Forecast;
  projectionLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Point;
  if (!point.bucket) {
    return (
      <div className="bg-surface-2 border-line-strong rounded-lg border px-3 py-2 text-xs shadow-lg">
        <p className="text-ink font-semibold">Today, {formatDate(forecast.today)}</p>
        <p className="text-muted mt-1">
          Bank balance <span className="num text-ink">{formatMoney(point.balance, currency)}</span>
        </p>
      </div>
    );
  }
  const b = point.bucket;
  return (
    <div className="bg-surface-2 border-line-strong w-80 max-w-[85vw] rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="text-ink font-semibold">{b.label}</p>
      <p className="text-faint mb-2">
        {formatDate(b.start)} to {formatDate(b.end)}
      </p>
      <div className="space-y-1.5">
        {LAYERS.flatMap((layer) =>
          (['in', 'out'] as const).map((direction) => (
            <TooltipLayer
              key={`${layer}-${direction}`}
              layer={layer}
              entries={b.entries.filter((e) => e.layer === layer && e.direction === direction)}
              currency={currency}
              projectionLabel={projectionLabel}
            />
          ))
        )}
        {!b.entries.length && <p className="text-muted">Nothing due in this period.</p>}
      </div>
      <div className="border-line-strong mt-2 space-y-0.5 border-t pt-1.5">
        <p className="flex justify-between gap-6">
          <span className="text-muted">Net movement</span>
          <span className="num text-ink">{formatMoney(b.net, currency, { sign: true })}</span>
        </p>
        <p className="flex justify-between gap-6">
          <span className="text-muted">Closing balance</span>
          <span className="num text-ink font-semibold">
            {b.closing === undefined ? 'Not available' : formatMoney(b.closing, currency)}
          </span>
        </p>
      </div>
    </div>
  );
}

const AXIS_WIDTH = 64;
const MARGIN = { top: 12, right: 16, bottom: 0, left: 4 };

/**
 * Two panels on one time axis: the running balance on top (its own scale, so
 * a small dip on a large balance is still visible) and the money in and out
 * per period below, around a zero line. Hovering either shows the period's
 * items by layer.
 */
export function ForecastChart({ forecast }: { forecast: Forecast }) {
  const currency = forecast.currency;
  const points = chartPoints(forecast);
  const lowest = forecast.lowest;
  const lowestPoint = lowest && points.find((p) => p.key === lowest.bucketKey);
  const projectionLabel = forecast.projection?.label;
  const series: { layer: ForecastLayer; direction: 'in' | 'out' }[] = LAYERS.flatMap((layer) =>
    (['in', 'out'] as const).map((direction) => ({ layer, direction }))
  );
  const syncId = `forecast-${forecast.currency}-${forecast.horizon}`;
  const hasBalance = forecast.opening.balance !== undefined;
  const balanceAxis = balanceTicks(
    points.map((p) => p.balance).filter((v): v is number => v !== undefined)
  );
  const stack = (p: Point, dir: 'In' | 'Out') =>
    LAYERS.reduce((sum, layer) => sum + (p[`${layer}${dir}`] ?? 0), 0);
  const flowAxis = niceTicks(
    Math.min(0, ...points.map((p) => stack(p, 'Out'))),
    Math.max(0, ...points.map((p) => stack(p, 'In'))),
    4
  );
  const xAxis = (hide: boolean) => (
    <XAxis
      dataKey="short"
      hide={hide}
      tickLine={false}
      axisLine={{ stroke: 'var(--color-line-strong)' }}
      tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
      interval="preserveStartEnd"
      minTickGap={8}
    />
  );
  const yAxis = (ticks: number[]) => (
    <YAxis
      tickFormatter={(v: number) => formatMoneyCompact(v, currency)}
      tickLine={false}
      axisLine={false}
      width={AXIS_WIDTH}
      ticks={ticks}
      domain={ticks.length ? [ticks[0], ticks[ticks.length - 1]] : undefined}
      interval={0}
      tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
    />
  );
  const tooltip = (
    <Tooltip
      cursor={{ fill: 'rgb(148 163 184 / 0.08)', stroke: 'var(--color-line-strong)' }}
      wrapperStyle={{ zIndex: 20 }}
      content={(props) => (
        <ChartTooltip
          {...(props as TooltipContentProps<number, string>)}
          currency={currency}
          forecast={forecast}
          projectionLabel={projectionLabel}
        />
      )}
    />
  );

  return (
    <div
      role="img"
      aria-label={`Cash flow forecast in ${currency}: the running balance, and money in and out per period${
        lowest ? `. Lowest balance ${formatMoney(lowest.balance, currency)} in ${lowest.label}` : ''
      }. The table below has every figure.`}
      data-testid="forecast-chart"
    >
      <p className="text-muted mb-1 text-xs" aria-hidden style={{ paddingLeft: AXIS_WIDTH }}>
        Balance
      </p>
      {hasBalance ? (
        <div className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} syncId={syncId} margin={{ ...MARGIN, bottom: 10 }}>
              <CartesianGrid vertical={false} stroke="var(--color-line)" />
              {xAxis(true)}
              {yAxis(balanceAxis)}
              <ReferenceLine
                y={0}
                stroke="var(--color-faint)"
                strokeWidth={1.5}
                ifOverflow="hidden"
              />
              {tooltip}
              <Line
                dataKey="balance"
                type="linear"
                stroke={BALANCE_COLOUR}
                strokeWidth={2}
                dot={{ r: 3, fill: BALANCE_COLOUR, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
              {lowest && lowestPoint && (
                <ReferenceDot
                  x={lowestPoint.short}
                  y={lowest.balance}
                  r={7}
                  fill={lowest.belowZero ? 'var(--color-danger)' : 'var(--color-warn)'}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                  label={{
                    value: `Lowest ${formatMoneyCompact(lowest.balance, currency)}`,
                    position: 'bottom',
                    offset: 10,
                    fill: 'var(--color-ink)',
                    fontSize: 12,
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-muted border-line flex h-24 items-center justify-center rounded-lg border border-dashed text-sm">
          No running balance: there&apos;s no opening balance in {currency} to start from.
        </p>
      )}
      <p className="text-muted mt-3 mb-1 text-xs" aria-hidden style={{ paddingLeft: AXIS_WIDTH }}>
        Money in and out
      </p>
      <div className="h-44 sm:h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={points}
            syncId={syncId}
            stackOffset="sign"
            barCategoryGap="24%"
            margin={MARGIN}
          >
            <defs>
              {(['in', 'out'] as const).map((d) => (
                <pattern
                  key={d}
                  id={`hatch-${d}`}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="6" height="6" fill={FLOW[d].colour} fillOpacity="0.12" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={FLOW[d].colour} strokeWidth="2.5" />
                </pattern>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            {xAxis(false)}
            {yAxis(flowAxis)}
            <ReferenceLine y={0} stroke="var(--color-faint)" strokeWidth={1.5} />
            {hasBalance ? (
              <Tooltip content={() => null} cursor={{ fill: 'rgb(148 163 184 / 0.08)' }} />
            ) : (
              tooltip
            )}
            {series.map(({ layer, direction }) => {
              const style = fillFor(layer, direction);
              return (
                <Bar
                  key={`${layer}-${direction}`}
                  dataKey={`${layer}${direction === 'in' ? 'In' : 'Out'}`}
                  stackId="flow"
                  fill={style.fill}
                  fillOpacity={style.fillOpacity}
                  stroke={style.stroke}
                  strokeWidth={style.stroke === 'none' ? 0 : 1.5}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
