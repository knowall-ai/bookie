import { notFound } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';
import { createAccount } from '@/lib/portal/actions/accounts';
import type { AccountInput } from '@/lib/domain/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { AccountForm } from '@/components/accounting/AccountForm';
import { taxRateOptions } from '@/components/accounting/options';

export const metadata = { title: 'Add account' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.accounts?.create) notFound();
  const [accounts, taxRates] = await Promise.all([
    connector.accounts.list(),
    connector.taxRates?.list().catch(() => []) ?? [],
  ]);
  const orgKey = org.key;
  async function save(input: AccountInput) {
    'use server';
    return createAccount(orgKey, input);
  }
  const chartPath = `${base}/accounting/chart`;
  return (
    <>
      <PageHeader
        title="Add account"
        crumbs={[
          { label: 'Accounting', href: `${base}/accounting` },
          { label: 'Chart of accounts', href: chartPath },
        ]}
      />
      <AccountForm
        taxRates={taxRateOptions(taxRates)}
        usedCodes={accounts.map((a) => a.code).filter(Boolean)}
        save={save}
        cancelHref={chartPath}
      />
    </>
  );
}
