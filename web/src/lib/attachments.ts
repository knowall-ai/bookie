/**
 * Attachment rules shared by the browser (upload validation) and the server
 * (the proxy route and upload action). No server-only imports here.
 */
import { ATTACHMENT_ENTITIES, type AttachmentEntity } from '@/lib/domain/types';

/** What the portal accepts for upload: PDFs and photos of receipts. */
export const UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];
export const UPLOAD_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Types the proxy will render inline (anything else is forced to download). */
const INLINE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  csv: 'text/csv',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** MIME type from a file name, for sources that send only `application/octet-stream`. */
export function contentTypeFromName(fileName: string): string | undefined {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  return ext ? BY_EXTENSION[ext] : undefined;
}

/** Normalise a reported MIME type (`image/jpg` is common in Xero but not a real type). */
export function normaliseContentType(value: string | undefined): string | undefined {
  const type = value?.split(';')[0].trim().toLowerCase();
  if (!type) return undefined;
  return type === 'image/jpg' || type === 'image/pjpeg' ? 'image/jpeg' : type;
}

export function canPreviewInline(contentType: string | undefined): boolean {
  return !!contentType && INLINE_TYPES.has(normaliseContentType(contentType) ?? '');
}

export function previewKind(contentType: string | undefined): 'pdf' | 'image' | undefined {
  const type = normaliseContentType(contentType);
  if (type === 'application/pdf') return 'pdf';
  if (type && INLINE_TYPES.has(type) && type.startsWith('image/')) return 'image';
  return undefined;
}

/** Check a file before upload. Returns an error message, or undefined when it's fine. */
export function validateUpload(file: {
  name: string;
  type: string;
  size: number;
}): string | undefined {
  const type = normaliseContentType(file.type) ?? contentTypeFromName(file.name);
  if (!type || !(UPLOAD_TYPES as readonly string[]).includes(type))
    return `${file.name} isn't a PDF, PNG or JPG.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is larger than 10 MB.`;
  return undefined;
}

/** Look at the first bytes: a renamed file must not pass as a PDF or image. */
export function sniffUploadType(bytes: ArrayBuffer): UploadType | undefined {
  const b = new Uint8Array(bytes.slice(0, 8));
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return undefined;
}

/** A file name that is safe in paths and Content-Disposition headers. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w .()-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned && !/^\.+$/.test(cleaned) ? cleaned : 'attachment';
}

export function formatFileSize(bytes: number | undefined): string | undefined {
  if (bytes === undefined) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}

export function isAttachmentEntity(value: string): value is AttachmentEntity {
  return (ATTACHMENT_ENTITIES as readonly string[]).includes(value);
}

/** Proxy URL for one attachment. `download` forces a download instead of inline. */
export function attachmentUrl(
  orgKey: string,
  entity: AttachmentEntity,
  id: string,
  attachmentId: string,
  download = false
): string {
  const path = [orgKey, 'attachments', entity, id, attachmentId].map(encodeURIComponent);
  return `/api/orgs/${path[0]}/${path[1]}/${path[2]}/${path[3]}/${path[4]}${download ? '?download=1' : ''}`;
}

export function inboxFileUrl(orgKey: string, fileId: string, download = false): string {
  return `/api/orgs/${encodeURIComponent(orgKey)}/attachments/inbox/${encodeURIComponent(fileId)}${download ? '?download=1' : ''}`;
}

/** One PDF or image in the shared accounts mailbox (Email › accounts mailbox). */
export function accountsInboxFileUrl(
  orgKey: string,
  messageId: string,
  attachmentId: string,
  download = false
): string {
  return `/api/orgs/${encodeURIComponent(orgKey)}/accounts-inbox/${encodeURIComponent(messageId)}/${encodeURIComponent(attachmentId)}${download ? '?download=1' : ''}`;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isGuid(value: string): boolean {
  return GUID.test(value);
}
