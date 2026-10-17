import { describe, expect, it, vi } from 'vitest';
import {
  attachmentsFor,
  bcAttachments,
  bcParent,
  decodeODataName,
  fromBcDocumentAttachment,
  type BcDocumentAttachment,
} from './attachments';
import type { BcClient } from '../client';

/* Shaped like BC API v2.0 documentAttachments rows observed live; values are fictional. */

const INVOICE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const VENDOR = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ATTACHMENT = 'cccccccc-dddd-4eee-8fff-000000000000';

const row: BcDocumentAttachment = {
  id: ATTACHMENT,
  fileName: 'Fabrikam invoice 104.pdf',
  byteSize: 191169,
  parentType: 'Purchase_x0020_Invoice',
  parentId: INVOICE,
  lastModifiedDateTime: '2026-10-03T19:34:22.397Z',
};

describe('BC document attachments', () => {
  it('decodes OData enum names', () => {
    expect(decodeODataName('Purchase_x0020_Credit_x0020_Memo')).toBe('Purchase Credit Memo');
  });

  it('maps a row, taking the type from the file name', () => {
    expect(fromBcDocumentAttachment(row)).toEqual({
      id: ATTACHMENT,
      fileName: 'Fabrikam invoice 104.pdf',
      contentType: 'application/pdf',
      size: 191169,
      updatedAt: '2026-10-03T19:34:22.397Z',
    });
  });

  it('treats byteSize 0 as unknown (BC reports 0 for files that have content)', () => {
    expect(fromBcDocumentAttachment({ ...row, byteSize: 0 }).size).toBeUndefined();
  });

  it('resolves parents: documents by GUID, contacts by c:/v: ids', () => {
    expect(bcParent('bill', INVOICE)).toEqual({ parentId: INVOICE, types: ['Purchase Invoice'] });
    expect(bcParent('contact', `v:${VENDOR}`)).toEqual({ parentId: VENDOR, types: ['Vendor'] });
    expect(() => bcParent('invoice', "x' or 1 eq 1")).toThrow();
    expect(() => bcParent('manual-journal', INVOICE)).toThrow();
  });

  it('keeps only rows of the right parent and type', () => {
    const rows = [row, { ...row, id: 'other', parentType: 'Sales_x0020_Invoice' }];
    expect(attachmentsFor(rows, INVOICE, ['Purchase Invoice']).map((a) => a.id)).toEqual([
      ATTACHMENT,
    ]);
  });

  it('uploads in two steps: create the record, then PATCH the content', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ...row, byteSize: 0 })
      .mockResolvedValue(undefined);
    const bytes = new ArrayBuffer(596);
    const created = await bcAttachments({ request } as unknown as BcClient).upload!(
      'bill',
      INVOICE,
      {
        fileName: 'Fabrikam invoice 104.pdf',
        contentType: 'application/pdf',
        bytes,
      }
    );
    expect(request).toHaveBeenNthCalledWith(1, 'documentAttachments', {
      method: 'POST',
      body: {
        fileName: 'Fabrikam invoice 104.pdf',
        parentType: 'Purchase Invoice',
        parentId: INVOICE,
      },
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      `documentAttachments(${ATTACHMENT})/attachmentContent`,
      {
        method: 'PATCH',
        etag: '*',
        rawBody: bytes,
        contentType: 'application/octet-stream',
      }
    );
    expect(created.size).toBe(596);
  });

  it('lists by parentId only (a parentType filter makes BC zero the sizes)', async () => {
    const request = vi.fn().mockResolvedValue({ value: [row] });
    await bcAttachments({ request } as unknown as BcClient).list('bill', INVOICE);
    expect(request.mock.calls[0][1].query.$filter).toBe(`parentId eq ${INVOICE}`);
  });
});
