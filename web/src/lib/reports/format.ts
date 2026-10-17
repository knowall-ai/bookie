import type { Report, ReportCell } from '@/lib/domain/types';

const number = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Xero's report style: thousands separators, two decimals, negatives in brackets. */
export function formatReportNumber(value: number): string {
  const text = number.format(Math.abs(value));
  return value < 0 && text !== '0.00' ? `(${text})` : text;
}

export function formatReportCell(value: ReportCell): string {
  if (value === null) return '';
  return typeof value === 'number' ? formatReportNumber(value) : value;
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The report as CSV: title lines, the column headings, then one line per row,
 * with section headings on their own line. Numbers stay raw (no brackets) so
 * spreadsheets can sum them.
 */
export function reportToCsv(report: Report): string {
  const width = Math.max(report.columns.length, 1);
  const pad = (cells: string[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill('')];
  const lines: string[][] = [
    [report.title],
    ...report.subtitles.map((s) => [s]),
    [],
    report.columns,
  ];
  for (const section of report.sections) {
    if (section.title) lines.push([section.title]);
    for (const row of section.rows) {
      lines.push(
        row.cells.map((c) => (c === null ? '' : typeof c === 'number' ? c.toFixed(2) : c))
      );
    }
  }
  return lines.map((l) => pad(l).map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** `profit-and-loss` + dates → `profit-and-loss-2026-10-01-2026-10-31.csv`. */
export function reportFileName(report: Report, parts: (string | undefined)[]): string {
  return [report.id, ...parts.filter(Boolean)].join('-') + '.csv';
}
