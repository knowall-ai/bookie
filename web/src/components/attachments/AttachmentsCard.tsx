import { Paperclip } from 'lucide-react';
import type { AccountingConnector } from '@/lib/connectors/types';
import { isConnectorError } from '@/lib/connectors/types';
import type { AttachmentEntity, OrgRef } from '@/lib/domain/types';
import { sourceName } from '@/lib/portal/context';
import { AttachmentsPanel } from './AttachmentsPanel';

function Note({ children }: { children: React.ReactNode }) {
  return (
    <section className="card px-5 py-4" aria-label="Attachments">
      <h2 className="text-ink flex items-center gap-2 text-[15px] font-semibold">
        <Paperclip className="text-muted h-4 w-4" aria-hidden /> Attachments
      </h2>
      <p className="text-muted mt-1 text-sm">{children}</p>
    </section>
  );
}

/** The "Attachments" card on a document's detail page. */
export async function AttachmentsCard({
  connector,
  org,
  entity,
  id,
}: {
  connector: AccountingConnector;
  org: OrgRef;
  entity: AttachmentEntity;
  id: string;
}) {
  const source = sourceName(org);
  const mod = connector.attachments;
  if (!mod || !mod.entities.includes(entity))
    return <Note>Attachments aren&apos;t available from {source} for this document.</Note>;

  const result = await mod
    .list(entity, id)
    .then((attachments) => ({ attachments }))
    .catch((error: unknown) => ({
      error: isConnectorError(error) ? error.message : 'The attachments could not be loaded.',
    }));
  if ('error' in result) return <Note>{result.error}</Note>;

  return (
    <AttachmentsPanel
      orgKey={org.key}
      entity={entity}
      documentId={id}
      attachments={result.attachments}
      canUpload={!!mod.upload}
      sourceName={source}
      maxFiles={mod.maxFilesPerDocument}
    />
  );
}
