import { formatMoney } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';

export function Money({
  amount,
  currency,
  className,
  colour,
}: {
  amount: number | null | undefined;
  currency?: string;
  className?: string;
  /** Tint negatives red and positives green. */
  colour?: boolean;
}) {
  const tint = colour && typeof amount === 'number' ? (amount < 0 ? 'text-danger' : amount > 0 ? 'text-brand-bright' : '') : '';
  return <span className={cn('num whitespace-nowrap', tint, className)}>{formatMoney(amount, currency)}</span>;
}
