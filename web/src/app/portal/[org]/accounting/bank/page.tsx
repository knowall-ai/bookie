import { ArrowLeftRight, Landmark, List, Plus } from 'lucide-react';
import { requireAuth, type AuthContext } from '@/lib/auth/context';
import {
  BITCOIN_DOCS,
  baseCurrencyOf,
  walletsForOrg,
  type OrgWallets,
  type WalletScope,
} from '@/lib/bitcoin/wallets';
import { orgContext, sourceName } from '@/lib/portal/context';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, NotAvailable } from '@/components/ui/States';
import { BankAccountCard } from '@/components/accounting/BankAccountCard';
import { BitcoinWalletCard } from '@/components/bitcoin/BitcoinWalletCard';

export const metadata = { title: 'Bank accounts' };

function BitcoinWalletsSection({
  auth,
  scope,
  currency,
  wallets,
  base,
}: {
  auth: AuthContext;
  scope: WalletScope;
  currency: string | undefined;
  wallets: OrgWallets;
  base: string;
}) {
  if (wallets.unavailable) {
    return (
      <p className="text-faint mt-8 text-sm" data-testid="bitcoin-unavailable">
        Bitcoin wallets: {wallets.unavailable}{' '}
        <a
          className="text-brand-bright hover:underline"
          href={BITCOIN_DOCS}
          target="_blank"
          rel="noreferrer"
        >
          How to set them up
        </a>
      </p>
    );
  }
  if (wallets.wallets.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="bitcoin-wallets-title">
      <h2 id="bitcoin-wallets-title" className="text-ink mb-1 text-lg font-semibold">
        Bitcoin wallets
      </h2>
      <p className="text-muted mb-4 text-sm">
        Read live from the blockchain. Bookie can see these wallets but never spend from them.
      </p>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {wallets.wallets.map((wallet) => (
          <BitcoinWalletCard
            key={wallet.id}
            auth={auth}
            scope={scope}
            currency={currency}
            wallet={wallet}
            href={`${base}/accounting/bank/bitcoin/${encodeURIComponent(wallet.id)}`}
          />
        ))}
      </div>
    </section>
  );
}

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { connector, base, org } = await orgContext(orgParam);
  const auth = await requireAuth(`/portal/${orgParam}/accounting/bank`);
  const scope: WalletScope = { org, connector };
  // If wallets can't be read (settings store or BC down), the bank accounts still show.
  const wallets = await walletsForOrg(auth, scope).catch((error): OrgWallets => {
    console.error('[bookie] bitcoin wallets unavailable', error);
    return { wallets: [], unavailable: "couldn't be read right now. Try again in a minute." };
  });
  // Wallets are valued in the organisation's base currency, as its books report it.
  const currency = wallets.wallets.length ? await baseCurrencyOf(connector) : undefined;
  const crumbs = [{ label: 'Accounting', href: `${base}/accounting` }];
  const walletsSection = (
    <BitcoinWalletsSection
      auth={auth}
      scope={scope}
      currency={currency}
      wallets={wallets}
      base={base}
    />
  );
  if (!connector.bank) {
    return (
      <>
        <PageHeader title="Bank accounts" crumbs={crumbs} />
        <NotAvailable feature="Bank accounts" source={sourceName(org)} />
        {walletsSection}
      </>
    );
  }
  const accounts = await connector.bank.accounts();
  // One read of every account's history, after the balances (Xero allows five calls at
  // once), shared by the cards and streamed in.
  const histories = accounts.length
    ? connector.bank.balanceHistory?.().catch(() => undefined)
    : undefined;
  const canCreate = !!connector.bank.createTransaction;
  const canTransfer = !!connector.bank.createTransfer && accounts.length >= 2;
  const hasTransfers = !!connector.bank.transfers;
  const newHref = `${base}/accounting/bank/new`;
  // "Add bank account" needs the source's rules and its currency list (never a default).
  const canAddAccount =
    !!connector.bank.createAccount && !!connector.bank.newAccount && !!connector.currencies;
  const addAccount = canAddAccount && (
    <ButtonLink href={`${base}/accounting/bank/add`} variant="primary">
      <Landmark className="h-4 w-4" /> Add bank account
    </ButtonLink>
  );
  // Xero's own wording is "Balance in Xero"; BC is abbreviated to fit the card.
  const source = org.kind === 'xero' ? 'Xero' : org.kind === 'business-central' ? 'BC' : 'books';

  return (
    <>
      <PageHeader
        title="Bank accounts"
        crumbs={crumbs}
        actions={
          <>
            {hasTransfers && (
              <ButtonLink href={`${base}/accounting/bank/transfers`} variant="ghost">
                <List className="h-4 w-4" /> Transfers
              </ButtonLink>
            )}
            {canTransfer && (
              <ButtonLink href={`${base}/accounting/bank/transfer`} variant="secondary">
                <ArrowLeftRight className="h-4 w-4" /> Transfer money
              </ButtonLink>
            )}
            {canCreate && accounts.length > 0 && (
              <ButtonLink href={newHref} variant={canAddAccount ? 'secondary' : 'primary'}>
                <Plus className="h-4 w-4" /> Spend or receive money
              </ButtonLink>
            )}
            {/* Where Xero puts "Add Bank Account": the main action, top right. */}
            {addAccount}
          </>
        }
      />
      {accounts.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-6 w-6" />}
          title="No bank accounts yet"
          body={`Bank accounts you add in ${sourceName(org)} appear here with their balances.`}
          action={addAccount || undefined}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <BankAccountCard
              key={account.id}
              account={account}
              href={`${base}/accounting/bank/${encodeURIComponent(account.id)}`}
              newHref={canCreate ? newHref : undefined}
              sourceLabel={source}
              source={org.kind === 'demo' ? 'the demo books' : sourceName(org)}
              histories={histories}
              feedNote={connector.bank?.feedNote}
            />
          ))}
        </div>
      )}
      {walletsSection}
    </>
  );
}
