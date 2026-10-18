import { notFound } from 'next/navigation';
import { orgContext, sourceName } from '@/lib/portal/context';
import { createBankAccount } from '@/lib/portal/actions/bank';
import type { BankAccountInput } from '@/lib/domain/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/States';
import { ButtonLink } from '@/components/ui/Button';
import { BankAccountForm } from '@/components/accounting/BankAccountForm';

export const metadata = { title: 'Add bank account' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { connector, base, org } = await orgContext(orgParam);
  const rules = connector.bank?.newAccount;
  if (!connector.bank?.createAccount || !rules || !connector.currencies) notFound();

  const [currencies, bankAccounts, chart] = await Promise.all([
    connector.currencies.list(),
    connector.bank.accounts().catch(() => []),
    // Only where bank account codes live in the chart of accounts (Xero) can they clash with it.
    rules.codeSharedWithChart ? (connector.accounts?.list().catch(() => []) ?? []) : [],
  ]);
  const usedCodes = [
    ...new Set([...bankAccounts.map((a) => a.code ?? ''), ...chart.map((a) => a.code)]),
  ].filter(Boolean);
  const bankPath = `${base}/accounting/bank`;
  const crumbs = [
    { label: 'Accounting', href: `${base}/accounting` },
    { label: 'Bank accounts', href: bankPath },
  ];
  const source = org.kind === 'demo' ? 'the demo books' : sourceName(org);
  // A currency the source didn't name (BC with no local currency set) can't be chosen.
  const choices = currencies.filter((c) => c.code.trim());
  if (choices.length === 0) {
    return (
      <>
        <PageHeader title="Add bank account" crumbs={crumbs} />
        <EmptyState
          title="No currencies set up"
          body={`Bookie couldn't find any currencies in ${source}, so it can't add a bank account. ${rules.currencySetup.text}`}
          action={<ButtonLink href={bankPath}>Back to bank accounts</ButtonLink>}
        />
      </>
    );
  }

  const orgKey = org.key;
  async function save(input: BankAccountInput) {
    'use server';
    return createBankAccount(orgKey, input);
  }
  return (
    <>
      <PageHeader title="Add bank account" crumbs={crumbs} />
      <BankAccountForm
        rules={rules}
        currencies={choices}
        sourceLabel={source}
        usedCodes={usedCodes}
        unnamedLocalCurrency={choices.length < currencies.length}
        save={save}
        cancelHref={bankPath}
      />
    </>
  );
}
