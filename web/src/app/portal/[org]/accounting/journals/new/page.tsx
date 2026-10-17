import { notFound } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';
import { createManualJournal } from '@/lib/portal/actions/journals';
import type { ManualJournalInput } from '@/lib/domain/types';
import { JournalEditor } from '@/components/accounting/JournalEditor';
import { reverseJournalLines } from '@/components/accounting/journal-lines';
import { accountOptions, taxRateOptions } from '@/components/accounting/options';

export const metadata = { title: 'New manual journal' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ reverse?: string }>;
}) {
  const [{ org: orgParam }, query] = await Promise.all([params, searchParams]);
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.journals?.create) notFound();
  const [accounts, taxRates, details, reversing] = await Promise.all([
    connector.accounts?.list().catch(() => []) ?? [],
    connector.taxRates?.list().catch(() => []) ?? [],
    connector.organisation(),
    query.reverse
      ? connector.journals.get(query.reverse.slice(0, 200)).catch(() => undefined)
      : undefined,
  ]);
  // "Reverse": a new draft with the same lines, debits and credits swapped, dated today.
  const initial = reversing
    ? {
        narration: `Reversal: ${reversing.narration}`.slice(0, 4000),
        lines: reverseJournalLines(reversing.lines),
      }
    : undefined;
  const orgKey = org.key;
  async function save(input: ManualJournalInput) {
    'use server';
    return createManualJournal(orgKey, input);
  }
  const listPath = `${base}/accounting/journals`;
  // Journal tax needs a real percentage; sources that can't give one get no tax column.
  const rates = taxRates.some((t) => t.rate === undefined) ? [] : taxRateOptions(taxRates);
  return (
    <JournalEditor
      initial={initial}
      currency={details.baseCurrency ?? ''}
      // Xero doesn't allow manual journals to bank accounts; BC G/L accounts are never banks.
      accounts={accountOptions(accounts)}
      taxRates={rates}
      save={save}
      cancelHref={listPath}
      savedHref={listPath}
    />
  );
}
