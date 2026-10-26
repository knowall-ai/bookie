'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { formatMoney, formatMoneyCompact, formatMonth } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';

/*
 * Two categorical series, validated for the dark surface (#111827) with the
 * dataviz palette checker: blue (income) and orange (expenses) pass lightness,
 * chroma, CVD (ΔE 26.8) and 3:1 contrast. Not success green or danger red, which
 * would read as "good" / "bad" status.
 */
const SERIES = {
  income: { label: 'Income', color: '#3987e5' },
  expenses: { label: 'Expenses', color: '#d95926' },
} as const;

export interface TrendPoint {
  month: string;
  income: number;
  expenses: number;
}

function monthYear(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: TooltipContentProps<number, string> & { currency: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as TrendPoint;
  const net = point.income - point.expenses;
  return (
    <div className="bg-surface-2 border-line-strong rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="text-ink mb-1.5 font-semibold">{monthYear(String(label))}</p>
      {(['income', 'expenses'] as const).map((key) => (
        <p key={key} className="flex items-center justify-between gap-6 py-0.5">
          <span className="text-muted flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: SERIES[key].color }}
            />
            {SERIES[key].label}
          </span>
          <span className="text-ink num">{formatMoney(point[key], currency)}</span>
        </p>
      ))}
      <p className="border-line mt-1.5 flex justify-between gap-6 border-t pt-1.5">
        <span className="text-muted">Net</span>
        <span className="text-ink num font-medium">{formatMoney(net, currency)}</span>
      </p>
    </div>
  );
}

/** Income and expenses per month (last 12 months), as Xero's home chart. */
export function IncomeExpensesChart({
  trend,
  currency,
}: {
  trend: TrendPoint[];
  currency: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const empty = trend.every((t) => !t.income && !t.expenses);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex items-center gap-4 text-xs" aria-label="Legend">
          {(['income', 'expenses'] as const).map((key) => (
            <li key={key} className="text-muted flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: SERIES[key].color }}
              />
              {SERIES[key].label}
            </li>
          ))}
        </ul>
        <div role="group" aria-label="View" className="bg-surface-2 flex rounded-lg p-0.5 text-xs">
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-md px-2.5 py-1 capitalize transition-colors',
                view === v ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'chart' ? (
        empty ? (
          <p className="text-muted flex h-64 items-center justify-center text-sm">
            No income or expenses recorded in the last 12 months.
          </p>
        ) : (
          <div
            className="h-64"
            role="img"
            aria-label={`Income and expenses for the last ${trend.length} months`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} barGap={2} barCategoryGap="22%" margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="0" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(m: string) => formatMonth(m).replace('Sept', 'Sep')}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-line-strong)' }}
                  tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) => formatMoneyCompact(v, currency)}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgb(148 163 184 / 0.08)' }}
                  content={(props) => (
                    <ChartTooltip
                      {...(props as TooltipContentProps<number, string>)}
                      currency={currency}
                    />
                  )}
                />
                {(['income', 'expenses'] as const).map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={SERIES[key].label}
                    fill={SERIES[key].color}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Income and expenses by month</caption>
            <thead className="text-muted text-xs">
              <tr className="border-line border-b">
                <th scope="col" className="py-2 text-left font-medium">
                  Month
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Income
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Expenses
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Net
                </th>
              </tr>
            </thead>
            <tbody>
              {trend.map((t) => (
                <tr key={t.month} className="border-line/60 border-b last:border-0">
                  <th scope="row" className="text-body py-1.5 text-left font-normal">
                    {monthYear(t.month)}
                  </th>
                  <td className="num text-ink py-1.5 text-right">
                    {formatMoney(t.income, currency)}
                  </td>
                  <td className="num text-ink py-1.5 text-right">
                    {formatMoney(t.expenses, currency)}
                  </td>
                  <td className="num text-ink py-1.5 text-right">
                    {formatMoney(t.income - t.expenses, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
