import type { Report, ReportCell, ReportId, ReportRow, ReportSection } from '@/lib/domain/types';

/** Xero's generic report payload (Reports/{Name}). */
export interface XeroReport {
  ReportID?: string;
  ReportName: string;
  ReportTitles?: string[];
  Rows?: XeroReportRow[];
}

export interface XeroReportRow {
  RowType: 'Header' | 'Section' | 'Row' | 'SummaryRow';
  Title?: string;
  Cells?: { Value?: string; Attributes?: { Id: string; Value: string }[] }[];
  Rows?: XeroReportRow[];
}

function cell(value: string | undefined, index: number): ReportCell {
  if (value === undefined || value === '') return null;
  if (index === 0) return value;
  const n = Number(value);
  return Number.isFinite(n) && /^-?[\d.]+$/.test(value.trim()) ? n : value;
}

function toRow(row: XeroReportRow): ReportRow {
  const cells = (row.Cells ?? []).map((c, i) => cell(c.Value, i));
  const accountId = row.Cells?.[0]?.Attributes?.find((a) => /^account(id)?$/i.test(a.Id))?.Value;
  return { kind: row.RowType === 'SummaryRow' ? 'summary' : 'row', cells, accountId };
}

/** Flatten Xero's nested Header/Section/Row tree into Bookie's report shape. */
export function fromXeroReport(id: ReportId, report: XeroReport): Report {
  const rows = report.Rows ?? [];
  const header = rows.find((r) => r.RowType === 'Header');
  const sections: ReportSection[] = [];
  for (const row of rows) {
    if (row.RowType === 'Section') {
      sections.push({ title: row.Title || undefined, rows: (row.Rows ?? []).map(toRow) });
    } else if (row.RowType === 'Row' || row.RowType === 'SummaryRow') {
      sections.push({ rows: [toRow(row)] });
    }
  }
  const [title, ...subtitles] = report.ReportTitles ?? [report.ReportName];
  return {
    id,
    title: title ?? report.ReportName,
    subtitles,
    columns: (header?.Cells ?? []).map((c) => c.Value ?? ''),
    sections: sections.filter((s) => s.title || s.rows.length),
    generatedAt: new Date().toISOString(),
  };
}

/** Find a summary row by its label (e.g. "Total Income") anywhere in a report. */
export function findReportValue(report: Report, label: RegExp, column = 1): number | undefined {
  for (const section of report.sections) {
    for (const row of section.rows) {
      if (typeof row.cells[0] === 'string' && label.test(row.cells[0])) {
        const v = row.cells[column];
        return typeof v === 'number' ? v : undefined;
      }
    }
  }
  return undefined;
}
