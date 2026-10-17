import { notFound } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';
import { editorData } from '@/lib/portal/editor-data';
import { createBillFromInboxFile } from '@/lib/portal/actions/attachments';
import type { InvoiceInput } from '@/lib/domain/types';
import { inboxFileUrl } from '@/lib/attachments';
import { DocumentEditor, type EditorPayload } from '@/components/documents/DocumentEditor';
import { FilePreview } from './FilePreview';

/**
 * New bill from an inbox file: the editor starts empty (the user keys the bill;
 * AI capture belongs to the Bookie agent), with the file beside it, and the
 * file is attached to the bill when it is saved.
 */
export async function InboxBillPage({ orgParam, fileId }: { orgParam: string; fileId: string }) {
  const { connector, base, org } = await orgContext(orgParam);
  const capture = connector.capture;
  if (!capture?.attachToBill || !connector.invoices?.create) notFound();
  const id = decodeURIComponent(fileId);
  const inbox = await capture.inbox();
  const file = inbox.files.find((f) => f.id === id);
  if (!file) notFound();

  const details = await connector.organisation();
  const data = await editorData(connector, 'purchase');
  const orgKey = org.key;

  async function save(payload: EditorPayload) {
    'use server';
    return createBillFromInboxFile(orgKey, id, { ...payload, type: 'purchase' } as InvoiceInput);
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <DocumentEditor
          heading="New bill"
          currency={details.baseCurrency}
          contactLabel="From"
          dateLabel="Date"
          secondDateLabel="Due date"
          docType="purchase"
          canApprove={!!connector.invoices.approve}
          save={save}
          cancelHref={`${base}/purchases/inbox?file=${encodeURIComponent(id)}`}
          savedHref={`${base}/purchases/bills`}
          {...data}
        />
      </div>
      <aside className="min-w-0 2xl:sticky 2xl:top-20 2xl:self-start" aria-label="Source document">
        <div className="card p-4">
          <p className="text-faint text-xs font-semibold tracking-wide uppercase">
            Attached on save
          </p>
          <p className="text-ink mt-0.5 mb-3 truncate text-sm font-medium" title={file.fileName}>
            {file.fileName}
          </p>
          <FilePreview
            src={inboxFileUrl(org.key, file.id)}
            fileName={file.fileName}
            contentType={file.contentType}
          />
        </div>
      </aside>
    </div>
  );
}
