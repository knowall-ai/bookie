import type { Inbox, InboxFile, ListQuery } from '@/lib/domain/types';
import { contentTypeFromName, isGuid, normaliseContentType } from '@/lib/attachments';
import type { CaptureModule } from '../../types';
import { CAPTURED_BY_BOOKIE, ConnectorError } from '../../types';
import { xeroString, type XeroClient } from '../client';
import { fromXeroInvoice, type XeroInvoice } from '../mappers';
import { xeroDeepLink } from '../index';

/** Files API (files.xro/1.0) shapes, as observed live. */
export interface XeroFolder {
  Id: string;
  Name: string;
  FileCount?: number;
  Email?: string;
  IsInbox?: boolean;
}

export interface XeroFile {
  Id: string;
  Name: string;
  MimeType?: string;
  Size?: number;
  CreatedDateUtc?: string;
  UpdatedDateUtc?: string;
  /** Present only for files inside a folder; files at the root have none. */
  FolderId?: string;
}

interface XeroFilesPage {
  TotalCount?: number;
  Page?: number;
  PerPage?: number;
  Items?: XeroFile[];
}

/** The Files API pages at up to 100 and cannot filter by folder. */
const FILES_PAGE = 100;
const MAX_FILE_PAGES = 20;

/** Files API timestamps are UTC without a zone: `2025-11-14T15:07:07.5200000`. */
export function xeroFilesTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function fromXeroFile(raw: XeroFile): InboxFile {
  return {
    id: raw.Id,
    fileName: raw.Name,
    contentType: normaliseContentType(raw.MimeType) ?? contentTypeFromName(raw.Name),
    size: typeof raw.Size === 'number' ? raw.Size : undefined,
    receivedAt: xeroFilesTimestamp(raw.CreatedDateUtc),
  };
}

/** Pick the inbox's files out of the org-wide list (newest first). */
export function inboxFilesFrom(files: XeroFile[], inboxId: string): InboxFile[] {
  return files
    .filter((f) => f.FolderId === inboxId)
    .map(fromXeroFile)
    .sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? ''));
}

/** `where` for draft bills the Bookie agent captured (reference carries the marker). */
export function capturedBillsWhere(): string {
  return `Type=="ACCPAY" AND Reference!=null AND Reference.Contains("${xeroString(CAPTURED_BY_BOOKIE)}")`;
}

export function xeroCapture(client: XeroClient, shortCode?: string): CaptureModule {
  return {
    async inbox(): Promise<Inbox> {
      const folder = await client.request<XeroFolder>('Inbox', { api: 'files' });
      const expected = folder.FileCount;
      if (expected === 0) return { files: [], email: folder.Email };
      const found: XeroFile[] = [];
      let total: number | undefined;
      let page = 1;
      for (; page <= MAX_FILE_PAGES; page++) {
        const result = await client.request<XeroFilesPage>('Files', {
          api: 'files',
          query: { pagesize: FILES_PAGE, page, sort: 'CreatedDateUTC', direction: 'DESC' },
        });
        const items = result.Items ?? [];
        total = result.TotalCount;
        found.push(...items.filter((f) => f.FolderId === folder.Id));
        if (expected !== undefined && found.length >= expected) break;
        if (items.length < FILES_PAGE) break;
      }
      const truncated =
        page > MAX_FILE_PAGES && (total === undefined || total > MAX_FILE_PAGES * FILES_PAGE);
      return {
        files: inboxFilesFrom(found, folder.Id),
        email: folder.Email,
        note: truncated
          ? `Xero has more than ${MAX_FILE_PAGES * FILES_PAGE} files, so some inbox files may not be listed. Open the Inbox in Xero to see them all.`
          : undefined,
      };
    },

    async inboxFile(fileId) {
      if (!isGuid(fileId)) throw new ConnectorError('File not found.', 404, 'xero');
      const [meta, content] = await Promise.all([
        client.request<XeroFile>(`Files/${fileId}`, { api: 'files' }),
        client.requestBytes(`Files/${fileId}/Content`, { api: 'files' }),
      ]);
      const file = fromXeroFile(meta);
      return {
        bytes: content.bytes,
        // Content comes back as octet-stream; the file record has the real type.
        contentType: file.contentType ?? 'application/octet-stream',
        fileName: file.fileName,
      };
    },

    async attachToBill(fileId, billId) {
      if (!isGuid(fileId) || !isGuid(billId))
        throw new ConnectorError('Unknown file or bill.', 400, 'xero');
      // An association is how Xero attaches a Files item: it then lists under the
      // bill's Attachments with the same id (verified read-only on a quote).
      await client.request(`Files/${fileId}/Associations`, {
        api: 'files',
        method: 'POST',
        body: { ObjectId: billId, ObjectGroup: 'Invoice', ObjectType: 'Accpay' },
      });
    },

    async capturedBills(query?: ListQuery) {
      const page = query?.page ?? 1;
      // Not summaryOnly: only full rows say whether a bill HasAttachments.
      const result = await client.request<{
        Invoices: (XeroInvoice & { HasAttachments?: boolean })[];
      }>('Invoices', {
        query: {
          where: capturedBillsWhere(),
          Statuses: 'DRAFT',
          order: 'Date DESC',
          page,
          pageSize: 100,
        },
      });
      const items = result.Invoices.filter((i) => i.HasAttachments).map((raw) => ({
        ...fromXeroInvoice(raw),
        sourceUrl: xeroDeepLink(shortCode, `/AccountsPayable/View.aspx?InvoiceID=${raw.InvoiceID}`),
      }));
      return { items, page, pageSize: 100, hasMore: result.Invoices.length >= 100 };
    },
  };
}
