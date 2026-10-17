import { Banknote } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { recordBatchPayment } from '@/lib/portal/actions/batch-payments';
import type { BatchPaymentInput } from '@/lib/domain/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { PayBillsForm } from '@/components/documents/PayBillsForm';

export const metadata = { title: 'Pay bills' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { connector, base, org } = await orgContext(orgParam);
  const billsPath = `${base}/purchases/bills`;
  const crumbs = [
    { label: 'Purchases', href: `${base}/purchases` },
    { label: 'Bills', href: billsPath },
  ];
  if (!connector.payments?.createBatch || !connector.invoices || !connector.bank) {
    return (
      <>
        <PageHeader title="Pay bills" crumbs={crumbs} />
        <EmptyState
          icon={<Banknote className="h-6 w-6" />}
          title="Batch payments aren't available for this organisation"
          body={
            org.kind === 'business-central'
              ? "Business Central's API has no batch payments: paying bills there means posting a payment journal batch, which Bookie doesn't do. Use Suggest Vendor Payments in Business Central."
              : `${sourceName(org)} doesn't support paying several bills at once through its API.`
          }
          action={<ButtonLink href={`${billsPath}?status=authorised`}>Back to bills</ButtonLink>}
        />
      </>
    );
  }

  const [bills, accounts, details] = await Promise.all([
    connector.invoices.list('purchase', { status: 'authorised', pageSize: 100 }),
    connector.bank.accounts(),
    connector.organisation(),
  ]);
  if (bills.items.length === 0) {
    return (
      <>
        <PageHeader title="Pay bills" crumbs={crumbs} />
        <EmptyState
          icon={<Banknote className="h-6 w-6" />}
          title="No bills awaiting payment"
          body="Approved bills appear here so you can pay several at once."
          action={<ButtonLink href={billsPath}>Back to bills</ButtonLink>}
        />
      </>
    );
  }

  const orgKey = org.key;
  async function save(input: BatchPaymentInput) {
    'use server';
    return recordBatchPayment(orgKey, input);
  }
  // Xero sends the batch reference to the bank as "Details" (18 characters) outside New Zealand.
  const shortReference = org.kind === 'xero' && details.country?.toUpperCase() !== 'NZ';
  return (
    <PayBillsForm
      bills={bills.items
        .filter((b) => b.status === 'authorised')
        .map((b) => ({
          id: b.id,
          number: b.number,
          reference: b.reference,
          supplier: b.contact.name,
          dueDate: b.dueDate,
          isOverdue: b.isOverdue,
          currency: b.currency,
          amountDue: typeof b.amountDue === 'number' ? b.amountDue : undefined,
        }))}
      bankAccounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        code: a.code,
        currency: a.currency,
      }))}
      referenceMax={shortReference ? 18 : 255}
      referenceHint={
        shortReference ? 'Up to 18 characters. Xero sends it to your bank.' : undefined
      }
      save={save}
      cancelHref={`${billsPath}?status=authorised`}
      savedHref={`${base}/accounting/payments?status=batches`}
    />
  );
}
