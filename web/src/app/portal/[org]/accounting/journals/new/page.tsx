import { notFound } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';
import { createManualJournal } from '@/lib/portal/actions/journals';
import type { ManualJournalInput } from '@/lib/domain/types';
import { JournalEditor } from '@/components/accounting/JournalEditor';
import { accountOptions, taxRateOptions } from '@/components/accounting/options';

export const metadata = { title: 'New manual journal' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.journals?.create) notFound();
  const [accounts, taxRates, details] = await Promise.all([
    connector.accounts?.list().catch(() => []) ?? [],
    connector.taxRates?.list().catch(() => []) ?? [],
    connector.organisation(),
  ]);
  const orgKey = org.key;
  async function save(input: ManualJournalInput) {
    'use server';
    return createManualJournal(orgKey, input);
  }
  const listPath = `${base}/accounting/journals`;
  // Journal tax needs a real percentage; sources that can't give one get no tax column.
  const rates = taxRates.some((t) => t.rateAvailable === false) ? [] : taxRateOptions(taxRates);
  return (
    <JournalEditor
      currency={details.baseCurrency}
      // Xero doesn't allow manual journals to bank accounts; BC G/L accounts are never banks.
      accounts={accountOptions(accounts)}
      taxRates={rates}
      save={save}
      cancelHref={listPath}
      savedHref={listPath}
    />
  );
}
