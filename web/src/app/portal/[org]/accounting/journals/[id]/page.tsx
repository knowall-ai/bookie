import { notFound } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/Badge';
import { DocumentFacts } from '@/components/documents/DocumentParts';
import { JournalActions } from '@/components/accounting/JournalActions';
import { SourceNote } from '@/components/accounting/SourceNote';
import type { JournalStatusChange, ManualJournal } from '@/lib/domain/types';

export const metadata = { title: 'Manual journal' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org: orgParam, id } = await params;
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.journals) notFound();
  const [journal, accounts, taxRates, details] = await Promise.all([
    connector.journals.get(decodeURIComponent(id)).catch((error) => {
      if (isConnectorError(error) && (error.status === 404 || error.status === 400)) notFound();
      throw error;
    }),
    connector.accounts?.list().catch(() => []) ?? [],
    connector.taxRates?.list().catch(() => []) ?? [],
    connector.organisation().catch(() => undefined),
  ]);
  const accountNames = new Map(accounts.map((a) => [a.code, a.name]));
  const taxNames = new Map(taxRates.map((t) => [t.taxType, t.name]));
  const showTax = journal.lines.some((l) => l.taxType);
  const debit = journal.lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0);
  const credit = journal.lines.reduce((s, l) => s + (l.amount < 0 ? -l.amount : 0), 0);
  const currency = details?.baseCurrency ?? '';
  const listPath = `${base}/accounting/journals`;
  const changes: JournalStatusChange[] = !connector.journals.setStatus
    ? []
    : journal.status === 'draft'
      ? ['posted', 'deleted']
      : journal.status === 'posted'
        ? ['voided']
        : [];
  const canReverse = journal.status === 'posted' && !!connector.journals.create;
  const AMOUNTS_ARE: Record<NonNullable<ManualJournal['lineAmountType']>, string> = {
    exclusive: 'Tax exclusive',
    inclusive: 'Tax inclusive',
    none: 'No tax',
  };
  const facts = [
    { label: 'Date', value: formatDate(journal.date) },
    { label: 'Total', value: formatMoney(journal.total, currency || undefined) },
  ];
  if (journal.lineAmountType) {
    facts.push({ label: 'Amounts are', value: AMOUNTS_ARE[journal.lineAmountType] });
  }
  if (journal.showOnCashBasisReports !== undefined) {
    facts.push({
      label: 'Cash basis reports',
      value: journal.showOnCashBasisReports ? 'Shown' : 'Not shown',
    });
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Accounting', href: `${base}/accounting` },
          { label: 'Manual journals', href: `${base}/accounting/journals` },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="truncate">{journal.narration || 'Manual journal'}</span>
            <StatusBadge status={journal.status} />
          </span>
        }
        meta="Manual journal"
        actions={
          <JournalActions
            orgKey={org.key}
            id={journal.id}
            changes={changes}
            listPath={listPath}
            reverseHref={
              canReverse ? `${listPath}/new?reverse=${encodeURIComponent(journal.id)}` : undefined
            }
          />
        }
      />
      <div className="space-y-5">
        <DocumentFacts facts={facts} />
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-line bg-surface-2/60 text-muted border-b text-xs font-semibold tracking-wide uppercase">
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Account</th>
                {showTax && <th className="hidden px-4 py-3 text-left md:table-cell">Tax rate</th>}
                <th className="px-4 py-3 text-right">Debit {currency}</th>
                <th className="px-4 py-3 text-right">Credit {currency}</th>
              </tr>
            </thead>
            <tbody>
              {journal.lines.map((line, i) => (
                <tr key={i} className="border-line/70 border-b">
                  <td className="text-ink px-4 py-3">{line.description ?? ''}</td>
                  <td className="text-body px-4 py-3">
                    <span className="num text-muted mr-2">{line.accountCode}</span>
                    {line.accountName ?? accountNames.get(line.accountCode) ?? ''}
                  </td>
                  {showTax && (
                    <td className="text-muted hidden px-4 py-3 md:table-cell">
                      {line.taxType ? (taxNames.get(line.taxType) ?? line.taxType) : ''}
                    </td>
                  )}
                  <td className="num text-ink px-4 py-3 text-right">
                    {line.amount > 0 ? formatMoney(line.amount) : ''}
                  </td>
                  <td className="num text-ink px-4 py-3 text-right">
                    {line.amount < 0 ? formatMoney(-line.amount) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-line-strong border-t font-semibold">
                <td colSpan={showTax ? 3 : 2} className="text-muted px-4 py-3 text-right">
                  Total
                </td>
                <td className="num text-ink px-4 py-3 text-right">{formatMoney(debit)}</td>
                <td className="num text-ink px-4 py-3 text-right">{formatMoney(credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {journal.hasAttachments && (
          <SourceNote>
            This journal has attachments in {org.kind === 'xero' ? 'Xero' : 'the source system'}.
          </SourceNote>
        )}
      </div>
    </>
  );
}
