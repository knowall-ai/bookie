import Link from 'next/link';
import { Suspense } from 'react';
import { Bitcoin } from 'lucide-react';
import type { AuthContext } from '@/lib/auth/context';
import {
  loadWalletSummary,
  valueBalance,
  type WalletScope,
  type WalletSummary,
} from '@/lib/bitcoin/wallets';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { BtcAmount, GbpValueView } from './BitcoinParts';

async function WalletBalance({
  auth,
  scope,
  wallet,
}: {
  auth: AuthContext;
  scope: WalletScope;
  wallet: WalletSummary;
}) {
  const load = await loadWalletSummary(auth, scope, wallet);
  if (load.status !== 'ok') {
    return (
      <p className="text-muted col-span-2 text-sm" data-testid="wallet-unavailable">
        {load.message}
      </p>
    );
  }
  const { confirmedSats, pendingSats } = load.scan.balance;
  const gbp = await valueBalance(confirmedSats, load.source);
  return (
    <>
      <div>
        <dt className="text-faint text-xs font-semibold tracking-wide uppercase">On chain</dt>
        <dd className="text-ink mt-1 text-lg font-semibold" data-testid="wallet-balance">
          <BtcAmount sats={confirmedSats} />
          {pendingSats !== 0 && (
            <span className="text-warn block text-xs font-normal">
              <BtcAmount sats={pendingSats} sign /> pending
            </span>
          )}
        </dd>
      </div>
      <div>
        <dt className="text-faint text-xs font-semibold tracking-wide uppercase">Value in GBP</dt>
        <dd className="text-ink mt-1 text-lg font-semibold">
          <GbpValueView value={gbp} className="items-start" />
        </dd>
      </div>
    </>
  );
}

/** A Bitcoin wallet on the Bank accounts page, next to the source's own bank accounts. */
export function BitcoinWalletCard({
  auth,
  scope,
  wallet,
  href,
}: {
  auth: AuthContext;
  scope: WalletScope;
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
      <dl className="grid flex-1 grid-cols-2 gap-4 px-5 py-4">
        <Suspense
          fallback={<p className="text-faint col-span-2 text-sm">Reading the blockchain…</p>}
        >
          <WalletBalance auth={auth} scope={scope} wallet={wallet} />
        </Suspense>
      </dl>
      <div className="border-line flex flex-wrap gap-2 border-t px-5 py-3">
        <Link href={href} className={buttonClass('secondary', 'sm')}>
          Wallet transactions
        </Link>
        {wallet.demo && <Badge>Demo data</Badge>}
      </div>
    </article>
  );
}
