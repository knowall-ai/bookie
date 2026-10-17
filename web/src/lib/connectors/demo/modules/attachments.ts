import type {
  Attachment,
  AttachmentEntity,
  AttachmentFile,
  InboxFile,
  Invoice,
} from '@/lib/domain/types';
import { ATTACHMENT_ENTITIES } from '@/lib/domain/types';
import { safeFileName } from '@/lib/attachments';
import type { AttachmentsModule, CaptureModule } from '../../types';
import { CAPTURED_BY_BOOKIE, ConnectorError } from '../../types';
import { addDays, DEMO_TODAY, type DemoData } from '../data';
import { demoPdf, demoReceiptPng } from './fixture-files';

interface StoredFile extends AttachmentFile {
  id: string;
  updatedAt: string;
}

interface AttachmentState {
  /** `${entity}:${id}` → files. */
  byDocument: Map<string, StoredFile[]>;
  inbox: StoredFile[];
  next: number;
  /** The draft bill the Bookie agent "captured". */
  capturedBillId?: string;
}

/**
 * Files live in one process-wide store per demo org, not on `DemoData`: in
 * Next.js dev the API route that streams a file is bundled separately from the
 * pages and actions, and each bundle builds its own `DemoData`.
 */
const STORE_KEY = Symbol.for('bookie.demo.attachments');
const stores = ((globalThis as Record<symbol, unknown>)[STORE_KEY] ??= new Map()) as Map<
  string,
  AttachmentState
>;

const CAPTURED_REFERENCE = `${CAPTURED_BY_BOOKIE} · emailed receipt`;

/** The demo mirrors Xero's limits. */
const MAX_FILES = 10;
const MAX_BYTES = 25 * 1024 * 1024;

const key = (entity: AttachmentEntity, id: string) => `${entity}:${id}`;

const stamp = (daysAgo: number, time = '09:12:00') =>
  `${addDays(DEMO_TODAY(), -daysAgo)}T${time}.000Z`;

function state(data: DemoData, orgKey: string): AttachmentState {
  let s = stores.get(orgKey);
  if (!s) {
    s = seed(data);
    stores.set(orgKey, s);
  }
  // Each bundle has its own DemoData: make sure this one shows the captured bill too.
  const captured = data.invoices.find((i) => i.id === s.capturedBillId);
  if (captured && captured.status === 'draft' && !captured.reference)
    captured.reference = CAPTURED_REFERENCE;
  return s;
}

function seed(data: DemoData): AttachmentState {
  {
    const s: AttachmentState = { byDocument: new Map(), inbox: [], next: 1 };
    // A supplier invoice PDF on the first authorised bill.
    const bill = data.invoices.find((i) => i.type === 'purchase' && i.status === 'authorised');
    if (bill) {
      s.byDocument.set(key('bill', bill.id), [
        {
          id: 'att-demo-1',
          fileName: `${bill.contact.name} invoice ${bill.number}.pdf`.replace(/[^\w .-]/g, ''),
          contentType: 'application/pdf',
          bytes: demoPdf(`Invoice ${bill.number}`, [
            bill.contact.name,
            `Invoice date ${bill.date}`,
            'Thank you for your business.',
          ]),
          updatedAt: stamp(3),
        },
      ]);
    }
    // One draft bill the Bookie agent captured from an emailed receipt.
    const captured = data.invoices.find((i) => i.type === 'purchase' && i.status === 'draft');
    if (captured) {
      s.capturedBillId = captured.id;
      s.byDocument.set(key('bill', captured.id), [
        {
          id: 'att-demo-2',
          fileName: 'receipt-scan.png',
          contentType: 'image/png',
          bytes: demoReceiptPng(),
          updatedAt: stamp(1, '16:40:00'),
        },
      ]);
    }
    s.inbox = [
      {
        id: 'inbox-demo-1',
        fileName: 'Northwind Packaging invoice NP-2291.pdf',
        contentType: 'application/pdf',
        bytes: demoPdf('Northwind Packaging Ltd', [
          'Invoice NP-2291',
          'Compostable coffee bags, 500 units',
          'Payment due within 30 days',
        ]),
        updatedAt: stamp(0, '08:05:00'),
      },
      {
        id: 'inbox-demo-2',
        fileName: 'Fabrikam Freight delivery note.pdf',
        contentType: 'application/pdf',
        bytes: demoPdf('Fabrikam Freight', [
          'Delivery note FF-7781',
          'Pallet delivery, Manchester depot',
        ]),
        updatedAt: stamp(2, '13:21:00'),
      },
      {
        id: 'inbox-demo-3',
        fileName: 'parking-receipt.png',
        contentType: 'image/png',
        bytes: demoReceiptPng(),
        updatedAt: stamp(4, '17:58:00'),
      },
    ];
    return s;
  }
}

function toAttachment(file: StoredFile): Attachment {
  return {
    id: file.id,
    fileName: file.fileName,
    contentType: file.contentType,
    size: file.bytes.byteLength,
    updatedAt: file.updatedAt,
  };
}

function toInboxFile(file: StoredFile): InboxFile {
  return {
    id: file.id,
    fileName: file.fileName,
    contentType: file.contentType,
    size: file.bytes.byteLength,
    receivedAt: file.updatedAt,
  };
}

const copy = (file: StoredFile): AttachmentFile => ({
  bytes: file.bytes.slice(0),
  contentType: file.contentType,
  fileName: file.fileName,
});

function findBill(data: DemoData, id: string): Invoice {
  const bill = data.invoices.find((i) => i.id === id && i.type === 'purchase');
  if (!bill) throw new ConnectorError('Bill not found.', 404, 'demo');
  return bill;
}

/** Invoices and bills must exist and be the right type; other documents live in other modules. */
function checkDocument(data: DemoData, entity: AttachmentEntity, id: string) {
  if (entity === 'invoice' || entity === 'bill') {
    const doc = data.invoices.find((i) => i.id === id);
    if (!doc || doc.type !== (entity === 'bill' ? 'purchase' : 'sales'))
      throw new ConnectorError('Document not found.', 404, 'demo');
  }
  if (entity === 'contact' && !data.contacts.some((c) => c.id === id))
    throw new ConnectorError('Contact not found.', 404, 'demo');
}

export function demoAttachments(data: DemoData, orgKey: string): AttachmentsModule {
  // Seed now, so the captured bill's reference shows even before any file is opened.
  state(data, orgKey);
  return {
    entities: ATTACHMENT_ENTITIES,
    maxUploadBytes: MAX_BYTES,
    maxFilesPerDocument: MAX_FILES,
    async list(entity, id) {
      checkDocument(data, entity, id);
      return (state(data, orgKey).byDocument.get(key(entity, id)) ?? []).map(toAttachment);
    },
    async download(entity, id, attachmentId) {
      // No document check here: the streaming route's DemoData may not have
      // documents created since (see STORE_KEY); the file store is the authority.
      const file = state(data, orgKey)
        .byDocument.get(key(entity, id))
        ?.find((f) => f.id === attachmentId);
      if (!file) throw new ConnectorError('Attachment not found.', 404, 'demo');
      return copy(file);
    },
    async upload(entity, id, file) {
      checkDocument(data, entity, id);
      const s = state(data, orgKey);
      const files = s.byDocument.get(key(entity, id)) ?? [];
      if (files.length >= MAX_FILES)
        throw new ConnectorError(`A document can have up to ${MAX_FILES} files.`, 400, 'demo');
      const stored: StoredFile = {
        id: `att-new-${s.next++}`,
        fileName: safeFileName(file.fileName),
        contentType: file.contentType,
        bytes: file.bytes.slice(0),
        updatedAt: new Date().toISOString(),
      };
      s.byDocument.set(key(entity, id), [...files, stored]);
      return toAttachment(stored);
    },
  };
}

export function demoCapture(data: DemoData, orgKey: string): CaptureModule {
  return {
    async inbox() {
      return {
        files: state(data, orgKey).inbox.map(toInboxFile),
        email: 'contoso.inbox@files.example.com',
      };
    },
    async inboxFile(fileId) {
      const file = state(data, orgKey).inbox.find((f) => f.id === fileId);
      if (!file) throw new ConnectorError('File not found.', 404, 'demo');
      return copy(file);
    },
    async attachToBill(fileId, billId) {
      findBill(data, billId);
      const s = state(data, orgKey);
      const file = s.inbox.find((f) => f.id === fileId);
      if (!file) throw new ConnectorError('File not found.', 404, 'demo');
      // Like the Xero connector, the file is linked to the bill and stays in the Inbox.
      const files = s.byDocument.get(key('bill', billId)) ?? [];
      s.byDocument.set(key('bill', billId), [
        ...files,
        { ...file, updatedAt: new Date().toISOString() },
      ]);
    },
    async capturedBills(query) {
      const s = state(data, orgKey);
      const items = data.invoices
        .filter(
          (i) =>
            i.type === 'purchase' &&
            i.status === 'draft' &&
            (i.reference ?? '').includes(CAPTURED_BY_BOOKIE) &&
            (s.byDocument.get(key('bill', i.id))?.length ?? 0) > 0
        )
        .map(({ lineItems: _lines, ...rest }) => structuredClone(rest));
      return { items, page: query?.page ?? 1, pageSize: 50, hasMore: false, total: items.length };
    },
  };
}
