import Link from 'next/link';
import { Suspense } from 'react';
import { Bitcoin } from 'lucide-react';
import type { AuthContext } from '@/lib/auth/context';
import {
  loadWalletSummary,
  balanceView,
  type WalletScope,
  type WalletSummary,
} from '@/lib/bitcoin/wallets';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { BitcoinBalancePanel } from './BitcoinBalancePanel';

async function WalletBalance({
  auth,
  scope,
  currency,
  wallet,
}: {
  auth: AuthContext;
  scope: WalletScope;
  /** The organisation's base currency, or undefined when its books don't say. */
  currency: string | undefined;
  wallet: WalletSummary;
}) {
  const load = await loadWalletSummary(auth, scope, wallet);
  if (load.status !== 'ok') {
    return (
      <p className="text-muted text-sm" data-testid="wallet-unavailable">
        {load.message}
      </p>
    );
  }
  const view = await balanceView(load.scan, load.source, currency, 30);
  return <BitcoinBalancePanel view={view} compact />;
}

/** A Bitcoin wallet on the Bank accounts page, next to the source's own bank accounts. */
export function BitcoinWalletCard({
  auth,
  scope,
  currency,
  wallet,
  href,
}: {
  auth: AuthContext;
  scope: WalletScope;
  /** The organisation's base currency, or undefined when its books don't say. */
  currency: string | undefined;
  wallet: WalletSummary;
  href: string;
}) {
  return (
    <article
      className="card flex flex-col"
      aria-labelledby={`wallet-${wallet.id}`}
      data-testid="bitcoin-wallet-card"
    >
      <div className="border-line flex items-start gap-3 border-b px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f7931a]/15 text-[#f7931a]">
          <Bitcoin className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id={`wallet-${wallet.id}`} className="text-ink truncate font-semibold">
            <Link href={href} className="hover:text-brand-bright transition-colors">
              {wallet.name}
            </Link>
          </h2>
          <p className="text-muted truncate text-sm">
            {[wallet.bcBankAccountNumber, wallet.typeLabel].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Badge tone="amber">BTC</Badge>
      </div>
      <div className="flex-1 px-5 py-4">
        <Suspense fallback={<p className="text-faint text-sm">Reading the blockchain…</p>}>
          <WalletBalance auth={auth} scope={scope} wallet={wallet} currency={currency} />
        </Suspense>
      </div>
      <div className="border-line flex flex-wrap gap-2 border-t px-5 py-3">
        <Link href={href} className={buttonClass('secondary', 'sm')}>
          Wallet transactions
        </Link>
        {wallet.demo && <Badge>Demo data</Badge>}
      </div>
    </article>
  );
}
