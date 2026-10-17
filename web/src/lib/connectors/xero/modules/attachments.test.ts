import { describe, expect, it, vi } from 'vitest';
import {
  fromXeroAttachment,
  xeroAttachments,
  xeroAttachmentsPath,
  type XeroAttachment,
} from './attachments';
import {
  capturedBillsWhere,
  fromXeroFile,
  inboxFilesFrom,
  xeroCapture,
  xeroFilesTimestamp,
  type XeroFile,
} from './capture';
import type { XeroClient } from '../client';

/* Fixtures are shaped like the real Xero responses observed live, with fictional values. */

const BILL = '0f1e2d3c-4b5a-4968-8776-655443322110';
const FILE = '11111111-2222-4333-8444-555555555555';
const INBOX = '99999999-8888-4777-8666-555555555555';

const attachment: XeroAttachment = {
  AttachmentID: FILE,
  FileName: 'Northwind invoice 2291.pdf',
  Url: `https://api.xero.com/api.xro/2.0/Invoices/${BILL}/Attachments/Northwind%20invoice%202291.pdf`,
  MimeType: 'application/pdf',
  ContentLength: 82801,
};

describe('Xero attachments mapping', () => {
  it('maps the Attachments array', () => {
    expect(fromXeroAttachment(attachment)).toEqual({
      id: FILE,
      fileName: 'Northwind invoice 2291.pdf',
      contentType: 'application/pdf',
      size: 82801,
    });
  });

  it('normalises image/jpg and leaves a missing size unknown', () => {
    const mapped = fromXeroAttachment({
      AttachmentID: FILE,
      FileName: 'receipt.jpg',
      MimeType: 'image/jpg',
    });
    expect(mapped.contentType).toBe('image/jpeg');
    expect(mapped.size).toBeUndefined();
  });

  it('builds entity paths and refuses non-GUID ids', () => {
    expect(xeroAttachmentsPath('bill', BILL)).toBe(`Invoices/${BILL}/Attachments`);
    expect(xeroAttachmentsPath('manual-journal', BILL)).toBe(`ManualJournals/${BILL}/Attachments`);
    expect(() => xeroAttachmentsPath('invoice', '../Organisation')).toThrow();
  });

  it('uploads the raw bytes with the file type to Attachments/{FileName}', async () => {
    const request = vi.fn().mockResolvedValue({ Attachments: [attachment] });
    const mod = xeroAttachments({ request } as unknown as XeroClient);
    const bytes = new TextEncoder().encode('%PDF-1.4').buffer as ArrayBuffer;
    await mod.upload!('bill', BILL, {
      fileName: 'Northwind/invoice.pdf',
      contentType: 'application/pdf',
      bytes,
    });
    expect(request).toHaveBeenCalledWith(`Invoices/${BILL}/Attachments/Northwindinvoice.pdf`, {
      method: 'PUT',
      rawBody: bytes,
      contentType: 'application/pdf',
    });
  });

  it('downloads by id and takes the name from the list', async () => {
    const bytes = new ArrayBuffer(4);
    const client = {
      request: vi.fn().mockResolvedValue({ Attachments: [attachment] }),
      requestBytes: vi.fn().mockResolvedValue({ bytes, contentType: 'application/pdf' }),
    };
    const file = await xeroAttachments(client as unknown as XeroClient).download(
      'bill',
      BILL,
      FILE
    );
    expect(client.requestBytes).toHaveBeenCalledWith(`Invoices/${BILL}/Attachments/${FILE}`);
    expect(file).toEqual({ bytes, contentType: 'application/pdf', fileName: attachment.FileName });
  });
});

const files: XeroFile[] = [
  {
    Id: FILE,
    Name: 'Fabrikam receipt.png',
    MimeType: 'image/png',
    Size: 5120,
    CreatedDateUtc: '2026-10-01T08:18:25.1530000',
    FolderId: INBOX,
  },
  {
    Id: '22222222-3333-4444-8555-666666666666',
    Name: 'Contract.pdf',
    MimeType: 'application/pdf',
    Size: 262144,
    CreatedDateUtc: '2026-10-02T08:18:25.1530000',
  },
  {
    Id: '33333333-4444-4555-8666-777777777777',
    Name: 'Northwind bill.pdf',
    MimeType: 'application/pdf',
    Size: 4096,
    CreatedDateUtc: '2026-10-03T10:00:00.0000000',
    FolderId: INBOX,
  },
];

describe('Xero Files inbox', () => {
  it('reads Files API timestamps as UTC', () => {
    expect(xeroFilesTimestamp('2026-10-01T08:18:25.1530000')).toBe('2026-10-01T08:18:25.153Z');
    expect(xeroFilesTimestamp(undefined)).toBeUndefined();
  });

  it('keeps only files in the inbox folder, newest first', () => {
    const inbox = inboxFilesFrom(files, INBOX);
    expect(inbox.map((f) => f.fileName)).toEqual(['Northwind bill.pdf', 'Fabrikam receipt.png']);
    expect(fromXeroFile(files[0])).toMatchObject({ contentType: 'image/png', size: 5120 });
  });

  it('skips the file listing when the inbox is empty', async () => {
    const request = vi.fn().mockResolvedValue({ Id: INBOX, Name: 'Inbox', FileCount: 0 });
    const inbox = await xeroCapture({ request } as unknown as XeroClient).inbox();
    expect(inbox.files).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('Inbox', { api: 'files' });
  });

  it('pages Files until it has found every inbox file', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ Id: INBOX, Name: 'Inbox', FileCount: 2, Email: 'in@example.com' })
      .mockResolvedValueOnce({ TotalCount: 3, Page: 1, PerPage: 100, Items: files });
    const inbox = await xeroCapture({ request } as unknown as XeroClient).inbox();
    expect(inbox.files).toHaveLength(2);
    expect(inbox.email).toBe('in@example.com');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('attaches an inbox file to a bill with a Files association', async () => {
    const request = vi.fn().mockResolvedValue({});
    await xeroCapture({ request } as unknown as XeroClient).attachToBill!(FILE, BILL);
    expect(request).toHaveBeenCalledWith(`Files/${FILE}/Associations`, {
      api: 'files',
      method: 'POST',
      body: { ObjectId: BILL, ObjectGroup: 'Invoice', ObjectType: 'Accpay' },
    });
  });

  it('finds captured bills by reference, keeping only those with attachments', async () => {
    expect(capturedBillsWhere()).toBe(
      'Type=="ACCPAY" AND Reference!=null AND Reference.Contains("Captured by Bookie")'
    );
    const bill = {
      InvoiceID: BILL,
      Type: 'ACCPAY' as const,
      Status: 'DRAFT' as const,
      Reference: 'Captured by Bookie',
      Contact: { ContactID: 'c-1', Name: 'Northwind Traders' },
      DateString: '2026-10-01T00:00:00',
      Total: 120,
      AmountDue: 120,
      AmountPaid: 0,
      CurrencyCode: 'GBP',
    };
    const request = vi.fn().mockResolvedValue({
      Invoices: [
        { ...bill, HasAttachments: true },
        { ...bill, InvoiceID: FILE, HasAttachments: false },
      ],
    });
    const page = await xeroCapture({ request } as unknown as XeroClient).capturedBills();
    expect(page.items.map((i) => i.id)).toEqual([BILL]);
    expect(request.mock.calls[0][1].query).toMatchObject({ Statuses: 'DRAFT' });
    expect(request.mock.calls[0][1].query.summaryOnly).toBeUndefined();
  });
});
