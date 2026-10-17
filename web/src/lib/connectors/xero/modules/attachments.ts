import type { Attachment, AttachmentEntity } from '@/lib/domain/types';
import { contentTypeFromName, isGuid, normaliseContentType, safeFileName } from '@/lib/attachments';
import type { AttachmentsModule } from '../../types';
import { ConnectorError } from '../../types';
import type { XeroClient } from '../client';

/** Accounting API endpoints that carry `/{id}/Attachments`. */
export const XERO_ATTACHMENT_PATHS: Record<AttachmentEntity, string> = {
  invoice: 'Invoices',
  bill: 'Invoices',
  'credit-note': 'CreditNotes',
  quote: 'Quotes',
  contact: 'Contacts',
  'bank-transaction': 'BankTransactions',
  'manual-journal': 'ManualJournals',
};

/** Xero's per-file limit (25 MB) and its 10 attachments per document. */
export const XERO_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const XERO_MAX_ATTACHMENTS = 10;

export interface XeroAttachment {
  AttachmentID: string;
  FileName: string;
  Url?: string;
  MimeType?: string;
  ContentLength?: number;
  IncludeOnline?: boolean;
}

export function fromXeroAttachment(raw: XeroAttachment): Attachment {
  return {
    id: raw.AttachmentID,
    fileName: raw.FileName,
    contentType: normaliseContentType(raw.MimeType) ?? contentTypeFromName(raw.FileName),
    size: typeof raw.ContentLength === 'number' ? raw.ContentLength : undefined,
  };
}

/** `Invoices/{id}/Attachments`; ids go into the path, so only GUIDs are accepted. */
export function xeroAttachmentsPath(entity: AttachmentEntity, id: string): string {
  if (!isGuid(id)) throw new ConnectorError('Unknown document id.', 400, 'xero');
  return `${XERO_ATTACHMENT_PATHS[entity]}/${id}/Attachments`;
}

export function xeroAttachments(client: XeroClient): AttachmentsModule {
  const list = async (entity: AttachmentEntity, id: string) => {
    const result = await client.request<{ Attachments?: XeroAttachment[] }>(
      xeroAttachmentsPath(entity, id)
    );
    return (result.Attachments ?? []).map(fromXeroAttachment);
  };

  return {
    entities: Object.keys(XERO_ATTACHMENT_PATHS) as AttachmentEntity[],
    maxUploadBytes: XERO_MAX_ATTACHMENT_BYTES,
    maxFilesPerDocument: XERO_MAX_ATTACHMENTS,
    list,
    async download(entity, id, attachmentId) {
      if (!isGuid(attachmentId)) throw new ConnectorError('Attachment not found.', 404, 'xero');
      // Downloads by id carry no file name, so read it from the list alongside the bytes.
      const [attachments, file] = await Promise.all([
        list(entity, id),
        client.requestBytes(`${xeroAttachmentsPath(entity, id)}/${attachmentId}`),
      ]);
      const meta = attachments.find((a) => a.id === attachmentId);
      if (!meta) throw new ConnectorError('Attachment not found.', 404, 'xero');
      return {
        bytes: file.bytes,
        contentType:
          normaliseContentType(file.contentType) ?? meta.contentType ?? 'application/octet-stream',
        fileName: meta.fileName,
      };
    },
    async upload(entity, id, file) {
      const fileName = safeFileName(file.fileName);
      const result = await client.request<{ Attachments?: XeroAttachment[] }>(
        `${xeroAttachmentsPath(entity, id)}/${encodeURIComponent(fileName)}`,
        { method: 'PUT', rawBody: file.bytes, contentType: file.contentType }
      );
      const created = result.Attachments?.[0];
      if (!created) throw new ConnectorError('Xero did not return the attachment.', 502, 'xero');
      return fromXeroAttachment(created);
    },
  };
}
