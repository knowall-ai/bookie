import type { Report, ReportSection } from '@/lib/domain/types';
import { formatReportCell } from '@/lib/reports/format';
import { cn } from '@/lib/ui/cn';

/**
 * A report laid out like Xero's: centred title, organisation and date lines,
 * section headings, indented account rows, bold summary rows, right-aligned
 * numbers with negatives in brackets. Prints black on white.
 */
export function ReportTable({ report }: { report: Report }) {
  const width = Math.max(
    report.columns.length,
    ...report.sections.flatMap((s) => s.rows.map((r) => r.cells.length))
  );
  const [orgLine, ...dateLines] = report.subtitles;
  return (
    <article
      aria-labelledby="report-title"
      className={cn(
        'card mx-auto print:max-w-none print:border-0 print:bg-white print:shadow-none',
        width <= 3 ? 'max-w-4xl' : width <= 6 ? 'max-w-6xl' : undefined
      )}
    >
      <header className="border-line border-b px-6 py-8 text-center print:border-black/20">
        <h2
          id="report-title"
          className="text-ink text-xl font-bold tracking-tight print:text-black"
        >
          {report.title}
        </h2>
        {orgLine && <p className="text-body mt-1 print:text-black">{orgLine}</p>}
        {dateLines.map((line) => (
          <p key={line} className="text-muted mt-0.5 text-sm print:text-black/70">
            {line}
          </p>
        ))}
      </header>
      <div className="overflow-x-auto px-2 pb-6 sm:px-6">
        <table className="w-full min-w-[480px] border-collapse text-sm print:text-black">
          <caption className="sr-only">
            {report.title}
            {report.subtitles.length ? `, ${report.subtitles.join(', ')}` : ''}
          </caption>
          <thead>
            <tr className="border-line border-b print:border-black/40">
              {Array.from({ length: width }, (_, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn(
                    'text-muted px-3 pt-5 pb-2 text-xs font-semibold whitespace-nowrap print:text-black',
                    i === 0 || report.textColumns?.includes(i) ? 'text-left' : 'text-right'
                  )}
                >
                  {report.columns[i] ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          {report.sections.map((section, s) => (
            <Section key={s} section={section} width={width} textColumns={report.textColumns} />
          ))}
        </table>
        {report.sections.every((s) => !s.rows.length) && (
          <p className="text-muted py-10 text-center text-sm">Nothing to report for this period.</p>
        )}
      </div>
    </article>
  );
}

function Section({
  section,
  width,
  textColumns,
}: {
  section: ReportSection;
  width: number;
  textColumns?: number[];
}) {
  const heading = !!section.title;
  // A title with no rows is a group heading ("Assets", "Liabilities").
  const group = heading && section.rows.length === 0;
  return (
    <tbody className="break-inside-avoid">
      {heading && (
        <tr>
          <th
            colSpan={width}
            scope="colgroup"
            className={cn(
              'px-3 text-left print:text-black',
              group
                ? 'text-ink pt-7 pb-1 text-base font-bold'
                : 'text-ink pt-5 pb-1.5 text-sm font-semibold'
            )}
          >
            {section.title}
          </th>
        </tr>
      )}
      {section.rows.map((row, r) => {
        const summary = row.kind === 'summary';
        const standalone = !heading && summary; // Gross Profit, Net Profit, Total Assets...
        return (
          <tr
            key={r}
            className={cn(
              summary
                ? 'border-line-strong border-t font-semibold print:border-black/50'
                : 'border-line/50 hover:bg-surface-2/60 border-b print:border-black/10',
              standalone && 'border-b'
            )}
          >
            {Array.from({ length: width }, (_, i) => {
              const value = row.cells[i] ?? null;
              if (i === 0) {
                return (
                  <th
                    key={i}
                    scope="row"
                    className={cn(
                      'py-2 pr-3 text-left',
                      summary ? 'font-semibold' : 'font-normal',
                      heading && !summary ? 'pl-7' : 'pl-3',
                      summary ? 'text-ink' : 'text-body',
                      standalone && 'py-3',
                      'print:text-black'
                    )}
                  >
                    {value ?? ''}
                  </th>
                );
              }
              if (textColumns?.includes(i)) {
                return (
                  <td
                    key={i}
                    className={cn(
                      'px-3 py-2 text-left print:text-black',
                      summary ? 'text-ink' : 'text-body'
                    )}
                  >
                    {formatReportCell(value)}
                  </td>
                );
              }
              return (
                <td
                  key={i}
                  className={cn(
                    'num px-3 py-2 text-right whitespace-nowrap print:text-black',
                    summary ? 'text-ink' : 'text-body',
                    standalone && 'py-3'
                  )}
                >
                  {formatReportCell(value)}
                </td>
              );
            })}
          </tr>
        );
      })}
    </tbody>
  );
}
