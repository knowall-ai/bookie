import type { FiatValue } from '@/lib/bitcoin/kraken';
import { formatBtc } from '@/lib/bitcoin/format';
import { cn } from '@/lib/ui/cn';
import { Money, NotAvailableValue } from '@/components/ui/Money';

/** A BTC amount from integer satoshis, always 8 decimals. */
export function BtcAmount({
  sats,
  sign,
  colour,
  className,
}: {
  sats: number;
  sign?: boolean;
  colour?: boolean;
  className?: string;
}) {
  const tint = colour ? (sats < 0 ? 'text-danger' : sats > 0 ? 'text-brand-bright' : '') : '';
  return (
    <span className={cn('num whitespace-nowrap', tint, className)}>
      {formatBtc(sats, { sign })}
    </span>
  );
}

/**
 * A value in the organisation's base currency with its source and rate time, or "—"
 * with the reason. The label is shown, not hidden in a tooltip: it is part of the figure.
 */
export function FiatValueView({
  value,
  compact,
  className,
}: {
  value: FiatValue;
  /** Put the label in a tooltip (tables); otherwise show it under the figure. */
  compact?: boolean;
  className?: string;
}) {
  if (!value.ok) return <NotAvailableValue reason={value.reason} className={className} />;
  return (
    <span className={cn('inline-flex flex-col items-end', className)}>
      <span title={compact ? value.rate.label : undefined} className={cn(compact && 'cursor-help')}>
        <Money amount={value.amount} currency={value.currency} />
      </span>
      {compact ? (
        <span className="sr-only">{value.rate.label}</span>
      ) : (
        <span className="text-faint text-xs font-normal">{value.rate.label}</span>
      )}
    </span>
  );
}
