import type { Attachment, AttachmentEntity } from '@/lib/domain/types';
import { contentTypeFromName, isGuid, safeFileName } from '@/lib/attachments';
import type { AttachmentsModule } from '../../types';
import { ConnectorError } from '../../types';
import type { BcClient, ODataList } from '../client';
import { parseContactId } from '../index';

/**
 * Business Central `documentAttachments` (API v2.0). Checked live: it holds the
 * files on sales and purchase invoices (draft and posted), quotes, credit memos,
 * customers and vendors. The older `attachments` entity is empty for those.
 *
 * Bank transactions and manual journals are not offered: Bookie's BC bank lines
 * and journals are ledger entries without a `documentAttachments` link.
 */
export interface BcDocumentAttachment {
  id: string;
  fileName?: string;
  /** Unreliable: often 0 for files that have content, so 0 is treated as unknown. */
  byteSize?: number;
  /** OData-encoded enum, e.g. `Purchase_x0020_Invoice`. */
  parentType?: string;
  parentId?: string;
  lastModifiedDateTime?: string;
}

type ParentType =
  | 'Sales Invoice'
  | 'Purchase Invoice'
  | 'Sales Quote'
  | 'Sales Credit Memo'
  | 'Purchase Credit Memo'
  | 'Customer'
  | 'Vendor';

const PARENT_TYPES: Partial<Record<AttachmentEntity, ParentType[]>> = {
  invoice: ['Sales Invoice'],
  bill: ['Purchase Invoice'],
  quote: ['Sales Quote'],
  'credit-note': ['Sales Credit Memo', 'Purchase Credit Memo'],
  contact: ['Customer', 'Vendor'],
};

/** `Purchase_x0020_Invoice` → `Purchase Invoice`. */
export function decodeODataName(value: string | undefined): string {
  return (value ?? '').replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

export function fromBcDocumentAttachment(raw: BcDocumentAttachment): Attachment {
  const fileName = raw.fileName?.trim() || 'attachment';
  return {
    id: raw.id,
    fileName,
    // BC sends attachment content as application/octet-stream, so the type comes from the name.
    contentType: contentTypeFromName(fileName),
    size: raw.byteSize && raw.byteSize > 0 ? raw.byteSize : undefined,
    updatedAt: raw.lastModifiedDateTime,
  };
}

/** The GUID BC stores as `parentId` for one of Bookie's document ids. */
export function bcParent(
  entity: AttachmentEntity,
  id: string
): { parentId: string; types: ParentType[] } {
  const types = PARENT_TYPES[entity];
  if (!types)
    throw new ConnectorError(
      'Business Central has no attachments for this kind of document.',
      400,
      'business-central'
    );
  if (entity === 'contact') {
    const party = parseContactId(id);
    return { parentId: party.id, types: [party.entity === 'customers' ? 'Customer' : 'Vendor'] };
  }
  if (!isGuid(id)) throw new ConnectorError('Unknown document id.', 400, 'business-central');
  return { parentId: id, types };
}

/** Keep the attachments whose parent is the document asked for. */
export function attachmentsFor(
  rows: BcDocumentAttachment[],
  parentId: string,
  types: ParentType[]
): Attachment[] {
  return rows
    .filter(
      (r) =>
        r.parentId?.toLowerCase() === parentId.toLowerCase() &&
        (types as string[]).includes(decodeODataName(r.parentType))
    )
    .map(fromBcDocumentAttachment);
}

export function bcAttachments(client: BcClient): AttachmentsModule {
  const rowsFor = async (parentId: string) =>
    // Filter on parentId only: adding parentType to the filter makes BC report byteSize 0.
    (
      await client.request<ODataList<BcDocumentAttachment>>('documentAttachments', {
        query: {
          $filter: `parentId eq ${parentId}`,
          $select: 'id,fileName,byteSize,parentType,parentId,lastModifiedDateTime',
        },
      })
    ).value;

  const list = async (entity: AttachmentEntity, id: string) => {
    const { parentId, types } = bcParent(entity, id);
    return attachmentsFor(await rowsFor(parentId), parentId, types);
  };

  return {
    entities: Object.keys(PARENT_TYPES) as AttachmentEntity[],
    list,
    async download(entity, id, attachmentId) {
      if (!isGuid(attachmentId))
        throw new ConnectorError('Attachment not found.', 404, 'business-central');
      const meta = (await list(entity, id)).find((a) => a.id === attachmentId);
      if (!meta) throw new ConnectorError('Attachment not found.', 404, 'business-central');
      const bytes = await client.request<ArrayBuffer>(
        `documentAttachments(${attachmentId})/attachmentContent`,
        { raw: true }
      );
      return {
        bytes,
        contentType: meta.contentType ?? 'application/octet-stream',
        fileName: meta.fileName,
      };
    },
    async upload(entity, id, file) {
      const { parentId, types } = bcParent(entity, id);
      let parentType = types[0];
      if (entity === 'credit-note') {
        // Credit note ids don't say sales or purchase: ask BC which one has it.
        const isSales = await client
          .request(`salesCreditMemos(${parentId})`, { query: { $select: 'id' } })
          .then(() => true)
          .catch((error) => {
            if (error instanceof ConnectorError && error.status === 404) return false;
            throw error;
          });
        parentType = isSales ? 'Sales Credit Memo' : 'Purchase Credit Memo';
      }
      const fileName = safeFileName(file.fileName);
      // Two steps, as BC requires: create the record, then PATCH its media content.
      const created = await client.request<BcDocumentAttachment>('documentAttachments', {
        method: 'POST',
        body: { fileName, parentType, parentId },
      });
      try {
        await client.request(`documentAttachments(${created.id})/attachmentContent`, {
          method: 'PATCH',
          etag: '*',
          rawBody: file.bytes,
          contentType: 'application/octet-stream',
        });
      } catch (error) {
        await client
          .request(`documentAttachments(${created.id})`, { method: 'DELETE', etag: '*' })
          .catch(() => {});
        throw error;
      }
      return {
        ...fromBcDocumentAttachment(created),
        // The bytes we just stored: BC's own byteSize is 0 until it is re-read.
        size: file.bytes.byteLength,
      };
    },
  };
}
