import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Paperclip, Users } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { BankTransaction } from '@/lib/domain/types';
import { formatDate, formatMoney, formatNumber } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { DocumentFacts, DocumentTotals } from '@/components/documents/DocumentParts';
import { SourceNote } from '@/components/accounting/SourceNote';
import { registerTypeLabel } from '@/components/accounting/register';

export const metadata = { title: 'Bank transaction' };

const AMOUNTS_ARE: Record<NonNullable<BankTransaction['lineAmountType']>, string> = {
  exclusive: 'Tax exclusive',
  inclusive: 'Tax inclusive',
  none: 'No tax',
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string; txId: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const [{ org: orgParam, id: rawId, txId }, query] = await Promise.all([params, searchParams]);
  const { connector, base, org } = await orgContext(orgParam);
  const bank = connector.bank;
  if (!bank?.transaction) notFound();
  const accountId = decodeURIComponent(rawId);
  const source =
    query.source === 'payment' || query.source === 'bank-transaction' ? query.source : undefined;

  const [transaction, accounts, chart, taxRates] = await Promise.all([
    bank.transaction(decodeURIComponent(txId), source).catch((error) => {
      if (isConnectorError(error) && (error.status === 404 || error.status === 400)) notFound();
      throw error;
    }),
    bank.accounts(),
    connector.accounts?.list().catch(() => []) ?? [],
    connector.taxRates?.list().catch(() => []) ?? [],
  ]);
  // The URL's account must be the transaction's own account.
  const account = accounts.find((a) => a.id === accountId);
  if (!account || (transaction.bankAccountId && transaction.bankAccountId !== accountId)) {
    notFound();
  }

  const accountNames = new Map(chart.map((a) => [a.code, a.name]));
  const taxNames = new Map(taxRates.map((t) => [t.taxType, t.name]));
  const currency = transaction.currency ?? account.currency;
  const incoming = transaction.type === 'receive' || transaction.type === 'transfer-in';
  const listPath = `${base}/accounting/bank/${encodeURIComponent(accountId)}`;
  const lines = transaction.lineItems ?? [];
  const label = registerTypeLabel(transaction);

  const documentHref =
    transaction.document?.kind === 'invoice'
      ? `${base}/sales/invoices/${encodeURIComponent(transaction.document.id)}`
      : transaction.document?.kind === 'bill'
        ? `${base}/purchases/bills/${encodeURIComponent(transaction.document.id)}`
        : undefined;

  const facts = [
    { label: 'Date', value: formatDate(transaction.date) },
    { label: 'Bank account', value: account.name },
    { label: 'Type', value: label },
    { label: incoming ? 'Received' : 'Spent', value: formatMoney(transaction.amount, currency) },
    { label: 'Reconciled', value: transaction.isReconciled ? 'Yes' : 'No' },
  ];
  if (transaction.contact) facts.push({ label: 'Contact', value: transaction.contact.name });
  if (transaction.reference) facts.push({ label: 'Reference', value: transaction.reference });
  if (transaction.lineAmountType) {
    facts.push({ label: 'Amounts are', value: AMOUNTS_ARE[transaction.lineAmountType] });
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Accounting', href: `${base}/accounting` },
          { label: 'Bank accounts', href: `${base}/accounting/bank` },
          { label: account.name, href: listPath },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="truncate">
              {label}
              {transaction.contact ? `: ${transaction.contact.name}` : ''}
            </span>
            <Badge tone={transaction.isReconciled ? 'green' : 'amber'}>
              {transaction.isReconciled ? 'Reconciled' : 'Unreconciled'}
            </Badge>
            {transaction.batchPaymentId && <Badge>Part of a batch payment</Badge>}
          </span>
        }
        meta={transaction.description}
      />
      <div className="space-y-5">
        <DocumentFacts facts={facts} />

        {transaction.document && (
          <p className="text-body text-sm">
            Pays{' '}
            {documentHref ? (
              <Link href={documentHref} className="text-brand-bright hover:underline">
                {transaction.document.number ?? 'the document'}
              </Link>
            ) : (
              <span className="text-ink">{transaction.document.number ?? 'a document'}</span>
            )}
            .
          </p>
        )}

        {lines.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Line items</caption>
              <thead>
                <tr className="border-line bg-surface-2/60 text-muted border-b text-xs font-semibold tracking-wide uppercase">
                  <th scope="col" className="px-4 py-3 text-left">
                    Description
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Qty
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Unit price
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Account
                  </th>
                  <th scope="col" className="hidden px-4 py-3 text-left md:table-cell">
                    Tax rate
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Amount {currency}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={line.id ?? i} className="border-line/70 border-b last:border-0">
                    <td className="text-ink px-4 py-3 whitespace-pre-line">{line.description}</td>
                    <td className="num px-4 py-3 text-right">{formatNumber(line.quantity, 4)}</td>
                    <td className="num px-4 py-3 text-right">{formatMoney(line.unitAmount)}</td>
                    <td className="text-body px-4 py-3">
                      {line.accountCode ? (
                        <>
                          <span className="num text-muted mr-2">{line.accountCode}</span>
                          {accountNames.get(line.accountCode) ?? ''}
                        </>
                      ) : (
                        ''
                      )}
                    </td>
                    <td className="text-muted hidden px-4 py-3 md:table-cell">
                      {line.taxType ? (taxNames.get(line.taxType) ?? line.taxType) : ''}
                    </td>
                    <td className="num text-ink px-4 py-3 text-right">
                      {formatMoney(line.lineAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(transaction.subTotal !== undefined || transaction.totalTax !== undefined) && (
          <DocumentTotals
            currency={currency}
            rows={[
              { label: 'Subtotal', amount: transaction.subTotal },
              { label: 'Total tax', amount: transaction.totalTax, muted: true },
              { label: 'Total', amount: transaction.amount, strong: true },
            ]}
          />
        )}

        {transaction.hasAttachments && (
          <SourceNote>
            <span className="inline-flex items-center gap-1.5">
              <Paperclip className="h-4 w-4" aria-hidden />
              This transaction has attachments in {sourceName(org)}.
            </span>
          </SourceNote>
        )}

        {transaction.contact && bank.filters?.contact && (
          <Link
            href={`${listPath}?contact=${encodeURIComponent(transaction.contact.id)}`}
            className="text-brand-bright inline-flex items-center gap-2 text-sm hover:underline"
          >
            <Users className="h-4 w-4" aria-hidden /> All transactions with{' '}
            {transaction.contact.name} in this account
          </Link>
        )}
      </div>
    </>
  );
}
