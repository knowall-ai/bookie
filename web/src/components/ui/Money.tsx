import { formatMoney } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';

export function Money({
  amount,
  currency,
  className,
  colour,
  missing,
}: {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
  /** Tint negatives red and positives green. */
  colour?: boolean;
  /**
   * Why the amount is missing, e.g. "Business Central doesn't report what's
   * left to pay". Shown as the dash's tooltip and read out by screen readers.
   */
  missing?: string;
}) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return <NotAvailableValue reason={missing} className={className} />;
  }
  const tint = colour ? (amount < 0 ? 'text-danger' : amount > 0 ? 'text-brand-bright' : '') : '';
  return (
    <span className={cn('num whitespace-nowrap', tint, className)}>
      {formatMoney(amount, currency)}
    </span>
  );
}

/** A dash for a figure the source didn't provide, with the reason as a tooltip. */
export function NotAvailableValue({ reason, className }: { reason?: string; className?: string }) {
  const label = reason ? `Not available: ${reason}` : 'Not available';
  return (
    <span
      className={cn('num text-faint whitespace-nowrap', reason && 'cursor-help', className)}
      title={label}
    >
      <span aria-hidden>—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
