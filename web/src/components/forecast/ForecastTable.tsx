'use client';

import Link from 'next/link';
import { useState } from 'react';
import { X } from 'lucide-react';
import { forecastRows, rowValue, type ForecastRow } from '@/lib/forecast/csv';
import type { Forecast, ForecastEntry, ForecastLayer, LayerTotals } from '@/lib/forecast/types';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { NotAvailableValue } from '@/components/ui/Money';
import { Badge } from '@/components/ui/Badge';
import { LayerSwatch } from './legend';

const LAYER_OF: Record<keyof LayerTotals, { layer: ForecastLayer; direction: 'in' | 'out' }> = {
  knownIn: { layer: 'known', direction: 'in' },
  knownOut: { layer: 'known', direction: 'out' },
  draftIn: { layer: 'draft', direction: 'in' },
  draftOut: { layer: 'draft', direction: 'out' },
  plannedIn: { layer: 'planned', direction: 'in' },
  plannedOut: { layer: 'planned', direction: 'out' },
  projectedIn: { layer: 'projected', direction: 'in' },
  projectedOut: { layer: 'projected', direction: 'out' },
};

const isFlow = (row: ForecastRow): row is ForecastRow & { kind: keyof LayerTotals } =>
  row.kind in LAYER_OF;

function entriesFor(forecast: Forecast, row: ForecastRow, column: number | 'total') {
  if (!isFlow(row)) return [];
  const { layer, direction } = LAYER_OF[row.kind];
  const buckets = column === 'total' ? forecast.buckets : [forecast.buckets[column]];
  return buckets.flatMap((b) =>
    b.entries.filter((e) => e.layer === layer && e.direction === direction)
  );
}

export function documentHref(base: string, entry: ForecastEntry) {
  if (!entry.document) return undefined;
  return entry.document.kind === 'invoice'
    ? `${base}/sales/invoices/${encodeURIComponent(entry.document.id)}`
    : `${base}/purchases/bills/${encodeURIComponent(entry.document.id)}`;
}

export function EntryList({
  entries,
  currency,
  base,
}: {
  entries: ForecastEntry[];
  currency: string;
  base: string;
}) {
  return (
    <ul className="divide-line divide-y">
      {entries.map((e, i) => {
        const href = documentHref(base, e);
        return (
          <li key={i} className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-3">
              <span className="text-faint num w-24 shrink-0 text-xs">{formatDate(e.date)}</span>
              {e.document ? (
                <span className="min-w-0 truncate">
                  {href ? (
                    <Link href={href} className="text-ink hover:text-brand-bright font-medium">
                      {e.document.number}
                    </Link>
                  ) : (
                    <span className="text-ink font-medium">{e.document.number}</span>
                  )}{' '}
                  <span className="text-muted">{e.label}</span>
                  {e.document.status !== 'authorised' && (
                    <Badge tone="neutral" className="ml-2">
                      {e.document.status === 'draft' ? 'Draft' : 'Awaiting approval'}
                    </Badge>
                  )}
                </span>
              ) : e.plannedId ? (
                <a
                  href={`#planned-${e.plannedId}`}
                  className="text-ink hover:text-brand-bright truncate"
                >
                  {e.label}
                </a>
              ) : (
                <span className="text-body truncate">{e.label}</span>
              )}
            </span>
            {e.amount === undefined ? (
              <NotAvailableValue reason="The source doesn't report what's left to pay." />
            ) : (
              <span className="num text-ink shrink-0">
                {formatMoney((e.direction === 'out' ? -1 : 1) * e.amount, currency)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Rows: opening, each layer in and out, net, closing. Columns: the buckets. Cells drill down. */
export function ForecastTable({ forecast, base }: { forecast: Forecast; base: string }) {
  const [selected, setSelected] = useState<{ row: string; column: number | 'total' }>();
  const rows = forecastRows(forecast, 'Projected');
  const currency = forecast.currency;
  const columns: (number | 'total')[] = [...forecast.buckets.map((_, i) => i), 'total'];
  const selectedRow = rows.find((r) => r.key === selected?.row);
  const drill = selected && selectedRow ? entriesFor(forecast, selectedRow, selected.column) : [];
  const missing = 'No bank account in this currency has a known balance.';

  return (
    <div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-max text-sm" data-testid="forecast-table">
          <caption className="sr-only">
            Cash flow forecast in {currency} by {forecast.horizon === '13w' ? 'week' : 'month'}
          </caption>
          <thead>
            <tr className="border-line text-muted border-b text-xs">
              <th
                scope="col"
                className="bg-surface sticky left-0 z-10 px-4 py-2.5 text-left font-medium"
              >
                {currency}
              </th>
              {forecast.buckets.map((b) => (
                <th
                  key={b.key}
                  scope="col"
                  className="px-3 py-2.5 text-right font-medium whitespace-nowrap"
                >
                  <span className="sr-only">{b.label}</span>
                  <span aria-hidden>{b.short}</span>
                </th>
              ))}
              <th scope="col" className="border-line border-l px-4 py-2.5 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const balanceRow = row.kind === 'opening' || row.kind === 'closing';
              const flow = isFlow(row);
              return (
                <tr
                  key={row.key}
                  className={cn(
                    'border-line/60 border-b last:border-0',
                    row.kind === 'closing' && 'bg-surface-2/60 border-line-strong border-t',
                    row.kind === 'net' && 'border-line-strong border-t'
                  )}
                >
                  <th
                    scope="row"
                    className={cn(
                      'bg-surface sticky left-0 z-10 px-4 py-2 text-left font-normal whitespace-nowrap',
                      balanceRow ? 'text-ink font-semibold' : 'text-body',
                      row.kind === 'closing' && 'bg-surface-2'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {flow && (
                        <LayerSwatch
                          layer={LAYER_OF[row.kind].layer}
                          direction={LAYER_OF[row.kind].direction}
                        />
                      )}
                      {row.label}
                    </span>
                  </th>
                  {columns.map((column) => {
                    const value = rowValue(forecast, row, column);
                    const count = flow ? entriesFor(forecast, row, column).length : 0;
                    const active = selected?.row === row.key && selected.column === column;
                    const label =
                      column === 'total' ? 'the whole period' : forecast.buckets[column].label;
                    const text =
                      value === undefined ? (
                        <NotAvailableValue reason={missing} />
                      ) : value === 0 && flow ? (
                        <span className="text-faint">–</span>
                      ) : (
                        formatMoney(value, currency)
                      );
                    return (
                      <td
                        key={column}
                        className={cn(
                          'num px-3 py-2 text-right whitespace-nowrap',
                          column === 'total' && 'border-line border-l px-4',
                          balanceRow ? 'text-ink font-semibold' : 'text-body',
                          value !== undefined && value < 0 && balanceRow && 'text-danger'
                        )}
                      >
                        {count > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSelected(active ? undefined : { row: row.key, column })
                            }
                            aria-expanded={active}
                            aria-label={`${row.label}, ${label}: ${formatMoney(value, currency)}. Show the ${count} item${count === 1 ? '' : 's'}.`}
                            className={cn(
                              'hover:text-brand-bright rounded px-1 underline decoration-dotted underline-offset-4 transition-colors',
                              active && 'bg-brand/15 text-brand-bright'
                            )}
                          >
                            {text}
                          </button>
                        ) : (
                          text
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected && selectedRow && (
        <div
          className="border-line bg-surface-2/40 border-t px-5 py-4"
          role="region"
          aria-label="Items behind the selected figure"
          data-testid="forecast-drilldown"
        >
          <div className="mb-2 flex items-center justify-between gap-4">
            <p className="text-ink text-sm font-semibold">
              {selectedRow.label},{' '}
              {selected.column === 'total'
                ? 'whole period'
                : forecast.buckets[selected.column].label}
            </p>
            <button
              type="button"
              onClick={() => setSelected(undefined)}
              className="text-muted hover:text-ink rounded p-1"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {selectedRow.kind === 'projectedIn' || selectedRow.kind === 'projectedOut' ? (
            <p className="text-muted mb-2 text-sm">
              {forecast.projection?.label}: {formatMoney(forecast.projection?.monthlyIn, currency)}{' '}
              a month in and {formatMoney(forecast.projection?.monthlyOut, currency)} a month out,
              from {forecast.projection?.transactionCount} bank transactions that weren&apos;t
              invoice or bill payments, spread evenly over each day.
            </p>
          ) : null}
          <EntryList entries={drill} currency={currency} base={base} />
        </div>
      )}
    </div>
  );
}
