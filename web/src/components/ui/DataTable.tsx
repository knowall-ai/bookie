import Link from 'next/link';
import { cn } from '@/lib/ui/cn';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** Hide on narrow screens. */
  hideOnMobile?: boolean;
}

/**
 * The portal's table. Server-renderable. Rows link to `rowHref` when given,
 * the whole row being clickable as in Xero.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
  footer,
  dense,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
  dense?: boolean;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const pad = dense ? 'px-4 py-2' : 'px-4 py-3';
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-line bg-surface-2/60 border-b">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    pad,
                    'text-muted text-xs font-semibold tracking-wide whitespace-nowrap uppercase',
                    c.align === 'right'
                      ? 'text-right'
                      : c.align === 'center'
                        ? 'text-center'
                        : 'text-left',
                    c.hideOnMobile && 'hidden md:table-cell',
                    c.className
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  className={cn(
                    'border-line/70 group border-b last:border-0',
                    href && 'hover:bg-surface-2/70 cursor-pointer'
                  )}
                >
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        'text-body p-0 align-middle',
                        c.align === 'right'
                          ? 'text-right'
                          : c.align === 'center'
                            ? 'text-center'
                            : 'text-left',
                        c.hideOnMobile && 'hidden md:table-cell',
                        c.className
                      )}
                    >
                      {href ? (
                        <Link href={href} className={cn('block', pad)} tabIndex={i === 0 ? 0 : -1}>
                          {c.cell(row)}
                        </Link>
                      ) : (
                        <div className={pad}>{c.cell(row)}</div>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>
    </div>
  );
}
