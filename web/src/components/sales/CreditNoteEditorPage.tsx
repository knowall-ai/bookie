import { notFound } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';
import { editorData } from '@/lib/portal/editor-data';
import { saveCreditNote } from '@/lib/portal/actions/credit-notes';
import type { CreditNoteType } from '@/lib/domain/types';
import { DocumentEditor, type EditorPayload } from '@/components/documents/DocumentEditor';
import { toEditorLines } from './editor-lines';
import { CREDIT_NOTE_COPY } from './CreditNotePages';

export async function CreditNoteEditorPage({
  orgParam,
  type,
  id,
}: {
  orgParam: string;
  type: CreditNoteType;
  id?: string;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  const mod = connector.creditNotes;
  if (!mod || !(id ? mod.update : mod.create)) notFound();

  const existing = id ? await mod.get(decodeURIComponent(id)).catch(() => notFound()) : undefined;
  if (existing && (existing.type !== type || !['draft', 'submitted'].includes(existing.status)))
    notFound();
  const [details, data] = await Promise.all([
    connector.organisation(),
    editorData(connector, type),
  ]);
  const copy = CREDIT_NOTE_COPY[type];
  const listPath = `${base}${copy.path}`;
  const orgKey = org.key;
  const noteId = existing?.id;

  async function save({
    dueDate: _due,
    title: _t,
    summary: _s,
    terms: _x,
    brandingThemeId: _b,
    status,
    ...payload
  }: EditorPayload) {
    'use server';
    return saveCreditNote(orgKey, noteId, {
      ...payload,
      type,
      status: status === 'authorised' ? 'authorised' : 'draft',
    });
  }

  const noun = type === 'sales' ? 'credit note' : 'supplier credit note';
  return (
    <DocumentEditor
      heading={existing ? `Edit ${noun} ${existing.number}` : `New ${noun}`}
      currency={existing?.currency ?? details.baseCurrency}
      contactLabel={copy.party}
      dateLabel="Date"
      numberLabel={type === 'sales' ? 'Credit note number' : undefined}
      docType={type}
      canApprove={!!mod.approve}
      approveBody="This approves the credit note and posts it to your live books. Its credit can then be allocated to an outstanding document."
      save={save}
      cancelHref={existing ? `${listPath}/${encodeURIComponent(existing.id)}` : listPath}
      savedHref={listPath}
      initial={
        existing && {
          contactId: existing.contact.id,
          date: existing.date,
          number: existing.number,
          reference: existing.reference,
          lineAmountType: existing.lineAmountType ?? 'exclusive',
          lineItems: toEditorLines(existing.lineItems),
        }
      }
      {...data}
    />
  );
}
