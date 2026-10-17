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

  async function save({
    dueDate,
    type: _type,
    status,
    brandingThemeId: _theme,
    ...payload
  }: EditorPayload) {
    'use server';
    return saveQuote(
      orgKey,
      quoteId,
      { ...payload, expiryDate: dueDate },
      { markSent: status === 'authorised' }
    );
  }
  // "Save and mark as sent", as in Xero's quote editor, for new and draft quotes.
  const canMarkSent =
    !!mod.setStatus &&
    (!mod.statusChanges || mod.statusChanges.includes('sent')) &&
    (!existing || existing.status === 'draft');

  return (
    <DocumentEditor
      heading={existing ? `Edit quote ${existing.number}` : 'New quote'}
      currency={existing?.currency ?? details.baseCurrency}
      contactLabel="Customer"
      dateLabel="Date"
      secondDateLabel="Expiry"
      numberLabel="Quote number"
      extraFields={['title', 'summary', 'terms']}
      canApprove={canMarkSent}
      approveLabel="Save and mark as sent"
      approveBody="The quote is saved and moves to Sent in your accounting system. Nothing is emailed to the customer."
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
          lineAmountType: existing.lineAmountType ?? 'exclusive',
          lineItems: toEditorLines(existing.lineItems),
        }
      }
      {...data}
    />
  );
}
