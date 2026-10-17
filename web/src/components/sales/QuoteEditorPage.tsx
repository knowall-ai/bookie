import { notFound } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';
import { editorData } from '@/lib/portal/editor-data';
import { saveQuote } from '@/lib/portal/actions/quotes';
import { DocumentEditor, type EditorPayload } from '@/components/documents/DocumentEditor';
import { toEditorLines } from './editor-lines';

export async function QuoteEditorPage({ orgParam, id }: { orgParam: string; id?: string }) {
  const { connector, base, org } = await orgContext(orgParam);
  const mod = connector.quotes;
  if (!mod || !(id ? mod.update : mod.create)) notFound();

  const existing = id ? await mod.get(decodeURIComponent(id)).catch(() => notFound()) : undefined;
  if (existing && existing.status !== 'draft' && existing.status !== 'sent') notFound();
  const [details, data] = await Promise.all([
    connector.organisation(),
    editorData(connector, 'sales'),
  ]);
  const listPath = `${base}/sales/quotes`;
  const orgKey = org.key;
  const quoteId = existing?.id;

  async function save({ dueDate, type: _type, status: _status, ...payload }: EditorPayload) {
    'use server';
    return saveQuote(orgKey, quoteId, { ...payload, expiryDate: dueDate });
  }

  return (
    <DocumentEditor
      heading={existing ? `Edit quote ${existing.number}` : 'New quote'}
      currency={existing?.currency ?? details.baseCurrency}
      contactLabel="Customer"
      dateLabel="Date"
      secondDateLabel="Expiry"
      numberLabel="Quote number"
      extraFields={['title', 'summary', 'terms']}
      save={save}
      cancelHref={existing ? `${listPath}/${encodeURIComponent(existing.id)}` : listPath}
      savedHref={listPath}
      initial={
        existing && {
          contactId: existing.contact.id,
          date: existing.date,
          dueDate: existing.expiryDate,
          number: existing.number,
          reference: existing.reference,
          title: existing.title,
          summary: existing.summary,
          terms: existing.terms,
          currency: existing.currency || undefined,
          currencyRate: existing.currencyRate,
          lineAmountType: existing.lineAmountType ?? 'exclusive',
          lineItems: toEditorLines(existing.lineItems),
        }
      }
      {...data}
    />
  );
}
