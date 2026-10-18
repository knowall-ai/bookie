import { ArrowLeftRight, Landmark, List, Plus } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, NotAvailable } from '@/components/ui/States';
import { BankAccountCard } from '@/components/accounting/BankAccountCard';

export const metadata = { title: 'Bank accounts' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { connector, base, org } = await orgContext(orgParam);
  const crumbs = [{ label: 'Accounting', href: `${base}/accounting` }];
  if (!connector.bank) {
    return (
      <>
        <PageHeader title="Bank accounts" crumbs={crumbs} />
        <NotAvailable feature="Bank accounts" source={sourceName(org)} />
      </>
    );
  }
  const accounts = await connector.bank.accounts();
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
            />
          ))}
        </div>
      )}
    </>
  );
}
