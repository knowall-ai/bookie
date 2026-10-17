import { notFound } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';
import { createBankTransaction } from '@/lib/portal/actions/bank';
import type { BankTransactionInput } from '@/lib/domain/types';
import { EmptyState } from '@/components/ui/States';
import { ButtonLink } from '@/components/ui/Button';
import { BankTransactionForm } from '@/components/accounting/BankTransactionForm';
import { accountOptions, taxRateOptions } from '@/components/accounting/options';

export const metadata = { title: 'Spend or receive money' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ type?: string; account?: string }>;
}) {
  const [{ org: orgParam }, query] = await Promise.all([params, searchParams]);
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.bank?.createTransaction) notFound();

  const [bankAccounts, contacts, accounts, taxRates] = await Promise.all([
    connector.bank.accounts(),
    connector.contacts
      ?.list({ pageSize: 500 })
      .then((p) => p.items)
      .catch(() => []) ?? [],
    connector.accounts?.list().catch(() => []) ?? [],
    connector.taxRates?.list().catch(() => []) ?? [],
  ]);
  const bankPath = `${base}/accounting/bank`;
  if (bankAccounts.length === 0) {
    return (
      <EmptyState
        title="Add a bank account first"
        body="Spend and receive money transactions are recorded against a bank account."
        action={<ButtonLink href={bankPath}>Back to bank accounts</ButtonLink>}
      />
    );
  }

  const orgKey = org.key;
  async function save(input: BankTransactionInput) {
    'use server';
    return createBankTransaction(orgKey, input);
  }

  const initialBankAccountId = bankAccounts.some((b) => b.id === query.account)
    ? query.account
    : undefined;
  return (
    <BankTransactionForm
      bankAccounts={bankAccounts.map((b) => ({
        value: b.id,
        label: b.name,
        currency: b.currency,
      }))}
      contacts={contacts
        .filter((c) => c.status === 'active')
        .map((c) => ({ value: c.id, label: c.name }))}
      accounts={accountOptions(accounts)}
      taxRates={taxRateOptions(taxRates)}
      initialType={query.type === 'receive' ? 'receive' : 'spend'}
      initialBankAccountId={initialBankAccountId}
      save={save}
      cancelHref={
        initialBankAccountId ? `${bankPath}/${encodeURIComponent(initialBankAccountId)}` : bankPath
      }
      savedHref={bankPath}
    />
  );
}
