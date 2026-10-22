import type { BankAccount } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';

/** Under a bank balance: the date it's as at, or what it covers when the source has no date. */
export function BalanceAsAt({
  account,
  className,
}: {
  account: Pick<BankAccount, 'balance' | 'balanceAsAt' | 'balanceNote'>;
  className?: string;
}) {
  if (account.balance === undefined) return null;
  const text = account.balanceAsAt
    ? `As at ${formatDate(account.balanceAsAt)}`
    : account.balanceNote;
  if (!text) return null;
  return (
    <span
      className={className ?? 'text-faint block text-xs font-normal'}
      data-testid="balance-as-at"
    >
      {text}
    </span>
  );
}
