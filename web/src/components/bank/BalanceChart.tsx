'use client';

import { useId } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { BalancePoint } from '@/lib/domain/types';
import { formatDate, formatMoney } from '@/lib/ui/format';

/*
 * One series, so no legend: the card names it. Blue is the portal's validated
 * series colour (see IncomeExpensesChart); not the success green, which would read as "good".
 */
const LINE = '#3987e5';

function ChartTooltip({
  active,
  payload,
  currency,
}: TooltipContentProps<number, string> & { currency: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as BalancePoint;
  return (
    <div className="bg-surface-2 border-line-strong rounded-md border px-2.5 py-1.5 text-xs shadow-lg">
      <p className="text-muted">{formatDate(point.date)}</p>
      <p className="text-ink num font-semibold">{formatMoney(point.balance, currency)}</p>
    </div>
  );
}

/**
 * Compact balance-over-time chart for a bank account card: an area with a 2px
 * line, no axes or grid, and a crosshair tooltip with the day's balance.
 * Decorative for assistive tech: the card carries a text summary.
 */
export function BalanceChart({
  points,
  currency,
  height = 56,
}: {
  points: BalancePoint[];
  currency: string;
  height?: number;
}) {
  const gradient = `balance-${useId().replace(/:/g, '')}`;
  const values = points.map((p) => p.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat balance sits mid-height rather than on the floor.
  const pad = max === min ? Math.max(1, Math.abs(max) * 0.05) : (max - min) * 0.1;
  return (
    <div style={{ height }} aria-hidden data-testid="balance-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          accessibilityLayer={false}
          data={points}
          margin={{ top: 4, right: 2, bottom: 2, left: 2 }}
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity={0.28} />
              <stop offset="100%" stopColor={LINE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[min - pad, max + pad]} />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                {...(props as TooltipContentProps<number, string>)}
                currency={currency}
              />
            )}
            cursor={{ stroke: 'var(--color-muted)', strokeWidth: 1 }}
            isAnimationActive={false}
            wrapperStyle={{ zIndex: 20, pointerEvents: 'none' }}
          />
          <Area
            type="linear"
            dataKey="balance"
            stroke={LINE}
            strokeWidth={2}
            fill={`url(#${gradient})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, stroke: 'var(--color-surface)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
