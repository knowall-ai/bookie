import type { LineItem } from '@/lib/domain/types';
import { formatNumber, formatMoney } from '@/lib/ui/format';
import { Money } from '@/components/ui/Money';
import { cn } from '@/lib/ui/cn';

/** Key facts under a document title: "To · Date · Due date · Reference". */
export function DocumentFacts({ facts }: { facts: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="card grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
      {facts.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-faint text-xs font-semibold tracking-wide uppercase">{f.label}</dt>
          <dd className="text-ink mt-1 truncate text-sm">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Read-only line items, Xero column order. */
export function DocumentLines({ lines, currency }: { lines: LineItem[]; currency: string }) {
  const showDiscount = lines.some((l) => l.discountRate);
  const showItem = lines.some((l) => l.itemCode);
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-line bg-surface-2/60 text-muted border-b text-xs font-semibold tracking-wide uppercase">
            {showItem && <th className="px-4 py-3 text-left">Item</th>}
            <th className="px-4 py-3 text-left">Description</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Price</th>
            {showDiscount && <th className="px-4 py-3 text-right">Disc %</th>}
            <th className="hidden px-4 py-3 text-left md:table-cell">Account</th>
            <th className="hidden px-4 py-3 text-left md:table-cell">Tax rate</th>
            <th className="px-4 py-3 text-right">Amount {currency}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={line.id ?? i} className="border-line/70 border-b last:border-0">
              {showItem && <td className="text-muted px-4 py-3">{line.itemCode}</td>}
              <td className="text-ink px-4 py-3 whitespace-pre-line">{line.description}</td>
              <td className="num px-4 py-3 text-right">{formatNumber(line.quantity, 4)}</td>
              <td className="num px-4 py-3 text-right">{formatMoney(line.unitAmount)}</td>
              {showDiscount && <td className="num px-4 py-3 text-right">{line.discountRate ? formatNumber(line.discountRate) : ''}</td>}
              <td className="text-muted hidden px-4 py-3 md:table-cell">{line.accountCode}</td>
              <td className="text-muted hidden px-4 py-3 md:table-cell">{line.taxType}</td>
              <td className="num text-ink px-4 py-3 text-right">{formatMoney(line.lineAmount)}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={8} className="text-muted px-4 py-6 text-center">
                No lines.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export interface TotalRow {
  label: string;
  amount: number | undefined;
  strong?: boolean;
  muted?: boolean;
}

export function DocumentTotals({ rows, currency }: { rows: TotalRow[]; currency: string }) {
  return (
    <div className="ml-auto w-full max-w-sm">
      <dl className="space-y-2 text-sm">
        {rows
          .filter((r) => r.amount !== undefined)
          .map((r) => (
            <div
              key={r.label}
              className={cn(
                'flex items-center justify-between gap-6',
                r.strong && 'border-line-strong text-ink border-t pt-2 text-base font-bold',
                r.muted && 'text-muted'
              )}
            >
              <dt>{r.label}</dt>
              <dd>
                <Money amount={r.amount} currency={r.strong ? currency : undefined} />
              </dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
