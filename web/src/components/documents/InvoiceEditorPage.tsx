import { notFound } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';
import { editorData } from '@/lib/portal/editor-data';
import { saveInvoice } from '@/lib/portal/actions/invoices';
import type { InvoiceInput, InvoiceType } from '@/lib/domain/types';
import { DocumentEditor, type EditorPayload } from './DocumentEditor';

export async function InvoiceEditorPage({
  orgParam,
  type,
  id,
}: {
  orgParam: string;
  type: InvoiceType;
  id?: string;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  const mod = connector.invoices;
  if (!mod || !(id ? mod.update : mod.create)) notFound();

  const existing = id ? await mod.get(decodeURIComponent(id)) : undefined;
  if (existing && (existing.type !== type || !['draft', 'submitted'].includes(existing.status)))
    notFound();
  const details = await connector.organisation();
  const data = await editorData(connector, type);
  const listPath = `${base}${type === 'sales' ? '/sales/invoices' : '/purchases/bills'}`;
  const orgKey = org.key;
  const invoiceId = existing?.id;

  async function save(payload: EditorPayload) {
    'use server';
    return saveInvoice(orgKey, invoiceId, { ...payload, type } as InvoiceInput);
  }

  const noun = type === 'sales' ? 'invoice' : 'bill';
  return (
    <DocumentEditor
      heading={existing ? `Edit ${noun} ${existing.number}` : `New ${noun}`}
      currency={existing?.currency ?? details.baseCurrency}
      contactLabel={type === 'sales' ? 'To' : 'From'}
      dateLabel="Date"
      secondDateLabel="Due date"
      numberLabel={type === 'sales' ? 'Invoice number' : undefined}
      docType={type}
      canApprove={!!mod.approve}
      save={save}
      cancelHref={existing ? `${listPath}/${encodeURIComponent(existing.id)}` : listPath}
      savedHref={listPath}
      initial={
        existing && {
          contactId: existing.contact.id,
          date: existing.date,
          dueDate: existing.dueDate,
          number: existing.number,
          reference: existing.reference,
          currency: existing.currency || undefined,
          currencyRate: existing.currencyRate,
          lineAmountType: existing.lineAmountType ?? 'exclusive',
          lineItems: existing.lineItems?.map(
            ({
              itemCode,
              description,
              quantity,
              unitAmount,
              discountRate,
              accountCode,
              taxType,
            }) => ({
              itemCode,
              description,
              quantity,
              unitAmount,
              discountRate,
              accountCode,
              taxType,
            })
          ),
        }
      }
      {...data}
    />
  );
}
