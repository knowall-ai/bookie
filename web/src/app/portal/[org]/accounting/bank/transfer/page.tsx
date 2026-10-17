import { notFound } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';
import { createBankTransfer } from '@/lib/portal/actions/transfers';
import type { BankTransferInput } from '@/lib/domain/types';
import { EmptyState } from '@/components/ui/States';
import { ButtonLink } from '@/components/ui/Button';
import { TransferForm } from '@/components/accounting/TransferForm';

export const metadata = { title: 'Transfer money' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ org: orgParam }, query] = await Promise.all([params, searchParams]);
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.bank?.createTransfer) notFound();
  const accounts = await connector.bank.accounts();
  const transfersPath = `${base}/accounting/bank/transfers`;
  if (accounts.length < 2) {
    return (
      <EmptyState
        title="You need two bank accounts to transfer money"
        body="Transfers move money between two of your own bank accounts."
        action={<ButtonLink href={`${base}/accounting/bank`}>Back to bank accounts</ButtonLink>}
      />
    );
  }
  const orgKey = org.key;
  async function save(input: BankTransferInput) {
    'use server';
    return createBankTransfer(orgKey, input);
  }
  return (
    <TransferForm
      bankAccounts={accounts.map((a) => ({ value: a.id, label: a.name, currency: a.currency }))}
      initialFromId={accounts.some((a) => a.id === query.from) ? query.from : undefined}
      save={save}
      cancelHref={`${base}/accounting/bank`}
      savedHref={transfersPath}
    />
  );
}
