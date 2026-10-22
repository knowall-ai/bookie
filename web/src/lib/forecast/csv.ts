import type { Forecast, LayerTotals } from './types';

/** A table row of the forecast: one figure per bucket, plus the total across the horizon. */
export interface ForecastRow {
  key: string;
  label: string;
  /** Which totals key (flows), or a running balance row. */
  kind: keyof LayerTotals | 'opening' | 'closing' | 'net';
  /** Money out is shown as a negative figure. */
  sign: 1 | -1;
}

/** The rows of the forecast table, for the layers that are switched on. */
export function forecastRows(forecast: Forecast, projectionLabel = 'Projected'): ForecastRow[] {
  const flow = (kind: keyof LayerTotals, label: string, sign: 1 | -1): ForecastRow => ({
    key: kind,
    label,
    kind,
    sign,
  });
  return [
    { key: 'opening', label: 'Opening balance', kind: 'opening', sign: 1 },
    flow('knownIn', 'Known in', 1),
    flow('knownOut', 'Known out', -1),
    ...(forecast.layers.drafts
      ? [flow('draftIn', 'Drafts in', 1), flow('draftOut', 'Drafts out', -1)]
      : []),
    flow('plannedIn', 'Planned in', 1),
    flow('plannedOut', 'Planned out', -1),
    ...(forecast.layers.projected
      ? [
          flow('projectedIn', `${projectionLabel} in`, 1),
          flow('projectedOut', `${projectionLabel} out`, -1),
        ]
      : []),
    ...(forecast.layers.pipeline ? [flow('pipelineIn', 'Pipeline (weighted)', 1)] : []),
    { key: 'net', label: 'Net movement', kind: 'net', sign: 1 },
    { key: 'closing', label: 'Closing balance', kind: 'closing', sign: 1 },
  ];
}

/** One cell: undefined when the running balance isn't known (no opening balance). */
export function rowValue(
  forecast: Forecast,
  row: ForecastRow,
  bucketIndex: number | 'total'
): number | undefined {
  if (bucketIndex === 'total') {
    if (row.kind === 'opening') return forecast.opening.balance;
    if (row.kind === 'closing') return forecast.closing;
    if (row.kind === 'net') {
      return Math.round(forecast.buckets.reduce((s, b) => s + b.net, 0) * 100) / 100;
    }
    return row.sign * forecast.totals[row.kind];
  }
  const b = forecast.buckets[bucketIndex];
  if (row.kind === 'opening') return b.opening;
  if (row.kind === 'closing') return b.closing;
  if (row.kind === 'net') return b.net;
  return row.sign * b.totals[row.kind];
}

const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The forecast table as CSV: plain numbers (no symbols), money out negative. */
export function forecastToCsv(forecast: Forecast, projectionLabel?: string): string {
  const header = [
    `Cash flow forecast (${forecast.currency})`,
    ...forecast.buckets.map((b) => b.label),
    'Total',
  ];
  const lines = [header.map(cell).join(',')];
  for (const row of forecastRows(forecast, projectionLabel)) {
    const values = [
      ...forecast.buckets.map((_, i) => rowValue(forecast, row, i)),
      rowValue(forecast, row, 'total'),
    ];
    lines.push(
      [row.label, ...values.map((v) => (v === undefined ? 'Not available' : v.toFixed(2)))]
        .map(cell)
        .join(',')
    );
  }
  lines.push('');
  lines.push(cell(`Layers: ${forecast.layersUsed.join('; ')}`));
  lines.push(
    cell(
      `Overdue (timing unknown, not included): in ${forecast.overdue.in.total.toFixed(2)} (${forecast.overdue.in.count}), out ${forecast.overdue.out.total.toFixed(2)} (${forecast.overdue.out.count})`
    )
  );
  if (forecast.unknownAmount.length) {
    lines.push(
      cell(`Amount not available (never added): ${forecast.unknownAmount.length} documents`)
    );
  }
  for (const item of forecast.pipelineExcluded) {
    lines.push(cell(`Not in the pipeline: ${item.label}: ${item.reason}`));
  }
  return lines.join('\r\n') + '\r\n';
}
