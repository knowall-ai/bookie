'use client';

import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { BalanceView } from '@/lib/bitcoin/wallets';
import { formatBtc } from '@/lib/bitcoin/format';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { LocalTime } from '@/components/history/LocalTime';
import { BtcAmount, FiatValueView } from './BitcoinParts';

type Unit = 'btc' | 'fiat';

/** The BTC / currency choice, per person and browser (never server state). */
const STORAGE_KEY = 'bookie:bitcoin-unit';
const CHANGE_EVENT = 'bookie:bitcoin-unit';

function useUnit(): [Unit, (unit: Unit) => void] {
  const [unit, setUnit] = useState<Unit>('btc');
  useEffect(() => {
    const read = () => setUnit(localStorage.getItem(STORAGE_KEY) === 'fiat' ? 'fiat' : 'btc');
    read();
    // Every card and page on screen follows one choice.
    window.addEventListener(CHANGE_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(CHANGE_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);
  const choose = (next: Unit) => {
    localStorage.setItem(STORAGE_KEY, next);
    setUnit(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return [unit, choose];
}

/* One series on the dark surface: Bitcoin orange, validated against #111827 for 3:1. */
const LINE = '#f7931a';

interface Point {
  date: string;
  sats: number;
  value?: number;
  rateLabel?: string;
}

function ChartTooltip({
  active,
  payload,
  unit,
  currency,
}: TooltipContentProps<number, string> & { unit: Unit; currency?: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Point;
  return (
    <div className="bg-surface-2 border-line-strong rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="text-ink font-semibold">{formatDate(point.date)}</p>
      <p className="text-ink num mt-1">
        {unit === 'btc'
          ? formatBtc(point.sats)
          : point.value === undefined
            ? '— (no price for this day)'
            : formatMoney(point.value, currency)}
      </p>
      {unit === 'fiat' && point.rateLabel && <p className="text-faint mt-0.5">{point.rateLabel}</p>}
    </div>
  );
}

/**
 * A wallet's balance with a BTC / base-currency toggle, a balance-over-time chart and
 * when it was last read. BTC is exact; the currency side is the value at Kraken's price,
 * labelled, or "—" with the reason.
 */
export function BitcoinBalancePanel({
  view,
  compact,
  testId,
}: {
  view: BalanceView;
  /** The bank page card: smaller, one line of figures. */
  compact?: boolean;
  testId?: string;
}) {
  const [unit, setUnit] = useUnit();
  const currencyLabel = view.currency ?? 'Currency';
  const fiat = unit === 'fiat';
  const data: Point[] = view.series.map((p) => ({ ...p }));
  const showChart = data.length > 1 && (!fiat || view.hasSeriesValues);

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-faint text-xs font-semibold tracking-wide uppercase">
            Confirmed balance
          </p>
          <p
            className={cn('text-ink mt-1 font-semibold', compact ? 'text-lg' : 'text-xl')}
            data-testid="wallet-balance"
          >
            {fiat ? (
              <FiatValueView value={view.now} className="items-start" />
            ) : (
              <BtcAmount sats={view.confirmedSats} />
            )}
            {view.pendingSats !== 0 && (
              <span className="text-warn block text-xs font-normal">
                <BtcAmount sats={view.pendingSats} sign /> pending (unconfirmed, not settled)
              </span>
            )}
          </p>
        </div>
        <div
          role="group"
          aria-label="Show the balance in"
          className="border-line-strong bg-surface-2 inline-flex shrink-0 rounded-lg border p-0.5 text-xs"
        >
          {(['btc', 'fiat'] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
              data-testid={`unit-${u}`}
              className={cn(
                'rounded-md px-2.5 py-1 font-medium transition-colors',
                unit === u ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink'
              )}
            >
              {u === 'btc' ? 'BTC' : currencyLabel}
            </button>
          ))}
        </div>
      </div>

      {showChart ? (
        <div className={compact ? 'h-16' : 'h-40'} data-testid="wallet-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="btc-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={LINE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                hide={compact}
                tick={{ fontSize: 11 }}
                minTickGap={40}
                tickFormatter={(d) => formatDate(String(d)).replace(/ \d{4}$/, '')}
                stroke="#6b7280"
              />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                content={(props) => (
                  <ChartTooltip
                    {...(props as TooltipContentProps<number, string>)}
                    unit={unit}
                    currency={view.currency}
                  />
                )}
              />
              <Area
                type="stepAfter"
                dataKey={fiat ? 'value' : 'sats'}
                stroke={LINE}
                strokeWidth={2}
                fill="url(#btc-fill)"
                connectNulls={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : fiat ? (
        <p className="text-faint text-xs">
          No balance history in {currencyLabel}: {view.seriesSource}
        </p>
      ) : null}

      <p className="text-faint text-xs" data-testid="wallet-checked">
        {view.series.length} days, end-of-day balances
        {fiat && view.hasSeriesValues ? `. ${view.seriesSource}` : ''}
        {' · '}Last checked <LocalTime iso={view.checkedAt} /> at block{' '}
        {view.tipHeight.toLocaleString('en-GB')}
      </p>
    </div>
  );
}
