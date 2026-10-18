import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import { configStoreFor } from '@/lib/config';
import type { AccountingConnector } from '@/lib/connectors/types';
import type { Contact, Invoice } from '@/lib/domain/types';
import { contentTypeFromName, MAX_UPLOAD_BYTES, normaliseContentType } from '@/lib/attachments';
import { GraphMailbox, type MailFile, type MailMessage } from '@/lib/mail/graph';
import { DemoMailbox } from '@/lib/mail/demo';
import { domainOf, mailTrustFacts, trustVerdict, type TrustVerdict } from '@/lib/mail/trust';
import { extractDocument, extractionConfigured } from './extract';
import { reviewExtraction, type DocumentKind, type ReviewedExtraction } from './extraction';
import {
  bankCheck,
  BANK_WARNING,
  contactDomains,
  findExistingBill,
  formatBankDetails,
  supplierDiff,
  supplierEvidence,
  matchSupplier,
  type BankCheck,
  type BillMatch,
  type FieldDiff,
  type SupplierEvidence,
  type SupplierMatch,
} from './match';

/**
 * Purchases › Accounts inbox: each PDF or image in the shared accounts mailbox, with
 * Bookie's verdict. Read live, as the signed-in user; nothing is written or stored. The
 * one cache holds what was read from each attachment, in memory, for ten minutes, keyed
 * by tenant, user, mailbox and attachment.
 */

export interface MailboxReader {
  readonly mailbox: string;
  list(since: string, max: number): Promise<MailMessage[]>;
  message(id: string): Promise<MailMessage>;
  attachment(messageId: string, attachmentId: string): Promise<MailFile>;
  /** Demo only: what the fixture document prints, instead of asking the model. */
  reading?(messageId: string, attachmentId: string): ReviewedExtraction['extraction'] | undefined;
}

export type Verdict =
  | { kind: 'suspicious'; reasons: string[] }
  | { kind: 'in-books'; match: BillMatch }
  | { kind: 'new' }
  | { kind: 'not-invoice'; documentKind: DocumentKind; reason: string }
  | { kind: 'unread'; reason: string };

export interface InboxItem {
  messageId: string;
  attachmentId: string;
  subject?: string;
  from: string | null;
  fromName?: string;
  receivedAt?: string;
  fileName: string;
  contentType: string;
  size?: number;
  trust: Pick<TrustVerdict, 'level' | 'reasons'>;
  verdict: Verdict;
  reading?: ReviewedExtraction;
  evidence?: SupplierEvidence;
  supplier?: SupplierMatch;
  /** Supplier fields the document shows differently (proposed, never applied automatically). */
  diffs?: FieldDiff[];
  bank?: BankCheck;
}

export const WEEK_CHOICES = [1, 2, 4, 8] as const;
export const DEFAULT_WEEKS = 4;
const MAX_MESSAGES = 40;
const CONCURRENCY = 4;
const TTL_MS = 10 * 60_000;
const MAX_CACHE = 500;

const DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

/* ------------------------------------------------------------------ */
/* Where the mailbox comes from                                        */
/* ------------------------------------------------------------------ */

export type MailboxSetup =
  | { ok: true; reader: MailboxReader }
  | { ok: false; reason: 'not-set' }
  | { ok: false; reason: 'settings-unavailable'; message: string };

export async function accountsMailbox(auth: AuthContext): Promise<MailboxSetup> {
  let address: string | undefined;
  try {
    address = (await configStoreFor(auth).getSettings()).accountsMailbox;
  } catch (error) {
    return {
      ok: false,
      reason: 'settings-unavailable',
      message: error instanceof Error ? error.message : 'Settings could not be read.',
    };
  }
  if (!address) return { ok: false, reason: 'not-set' };
  if (auth.mode === 'demo') return { ok: true, reader: new DemoMailbox() };
  return { ok: true, reader: new GraphMailbox(address, () => auth.getToken('graph')) };
}

/* ------------------------------------------------------------------ */
/* Reading attachments (cached briefly, per tenant and user)           */
/* ------------------------------------------------------------------ */

const CACHE_KEY = Symbol.for('bookie.accounts-inbox.readings');
const cache = ((globalThis as Record<symbol, unknown>)[CACHE_KEY] ??= new Map()) as Map<
  string,
  { at: number; value: Promise<ReviewedExtraction> }
>;

function cacheKey(auth: AuthContext, mailbox: string, messageId: string, attachmentId: string) {
  return [auth.user.tenantId, auth.user.id, mailbox.toLowerCase(), messageId, attachmentId].join(
    '\u0000'
  );
}

/** Forget cached readings (tests). */
export function clearReadings() {
  cache.clear();
}

async function read(
  auth: AuthContext,
  reader: MailboxReader,
  messageId: string,
  attachmentId: string
): Promise<ReviewedExtraction> {
  const fixture = reader.reading?.(messageId, attachmentId);
  if (fixture) return reviewExtraction(fixture);
  if (reader.reading) throw new Error('This demo document has nothing to read.');
  if (!extractionConfigured())
    throw new Error("Reading documents isn't set up on this server (Azure OpenAI).");
  const key = cacheKey(auth, reader.mailbox, messageId, attachmentId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  if (cache.size >= MAX_CACHE) {
    for (const [k, v] of cache) if (Date.now() - v.at >= TTL_MS) cache.delete(k);
    if (cache.size >= MAX_CACHE) cache.clear();
  }
  const value = reader.attachment(messageId, attachmentId).then((file) => extractDocument(file));
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

/* ------------------------------------------------------------------ */
/* Verdicts                                                            */
/* ------------------------------------------------------------------ */

/** The attachments worth reading: PDFs and images, not inline logos, within the upload limit. */
export function documentsOf(message: MailMessage) {
  return message.attachments
    .map((a) => ({
      ...a,
      contentType: normaliseContentType(a.contentType) ?? contentTypeFromName(a.name) ?? '',
    }))
    .filter(
      (a) =>
        !a.isInline &&
        DOCUMENT_TYPES.includes(a.contentType) &&
        (a.size === undefined || a.size <= MAX_UPLOAD_BYTES)
    );
}

/** Everything one review run needs from the books, fetched once and shared. */
export interface BooksLookup {
  contacts(): Promise<Contact[]>;
  contact(id: string): Promise<Contact | undefined>;
  bills(supplierId: string, invoiceNumber: string | null): Promise<Invoice[]>;
}

export function booksLookup(connector: AccountingConnector): BooksLookup {
  let contacts: Promise<Contact[]> | undefined;
  const one = new Map<string, Promise<Contact | undefined>>();
  const bills = new Map<string, Promise<Invoice[]>>();
  return {
    contacts() {
      contacts ??= (async () => {
        const mod = connector.contacts;
        if (!mod) return [];
        // Every contact, not only suppliers: Xero only flags a supplier once it has a bill.
        const all: Contact[] = [];
        for (let page = 1; page <= 4; page++) {
          const result = await mod.list({ page, pageSize: 500 });
          all.push(...result.items);
          if (!result.hasMore) break;
        }
        return all;
      })();
      return contacts;
    },
    contact(id) {
      if (!one.has(id))
        one.set(
          id,
          connector.contacts?.get(id).catch(() => undefined) ?? Promise.resolve(undefined)
        );
      return one.get(id)!;
    },
    bills(supplierId, invoiceNumber) {
      const key = `${supplierId}\u0000${invoiceNumber ?? ''}`;
      if (!bills.has(key)) {
        const mod = connector.invoices;
        bills.set(
          key,
          mod
            ? Promise.all([
                mod.list('purchase', { contactId: supplierId, pageSize: 100 }),
                invoiceNumber
                  ? mod.list('purchase', { search: invoiceNumber, pageSize: 50 })
                  : Promise.resolve({ items: [] as Invoice[] }),
              ]).then(([a, b]) => {
                const byId = new Map([...a.items, ...b.items].map((i) => [i.id, i]));
                return [...byId.values()];
              })
            : Promise.resolve([])
        );
      }
      return bills.get(key)!;
    },
  };
}

async function trustOf(message: MailMessage, books: BooksLookup, ownDomains: string[]) {
  const contacts = await books.contacts();
  return trustVerdict(mailTrustFacts(message), {
    supplierDomains: [...new Set(contacts.flatMap(contactDomains))],
    ownDomains,
  });
}

export async function reviewAttachment(
  auth: AuthContext,
  reader: MailboxReader,
  books: BooksLookup,
  message: MailMessage,
  attachment: ReturnType<typeof documentsOf>[number],
  trust: TrustVerdict
): Promise<InboxItem> {
  const item: InboxItem = {
    messageId: message.id,
    attachmentId: attachment.id,
    subject: message.subject,
    from: trust.facts.from,
    fromName: message.from?.emailAddress?.name,
    receivedAt: message.receivedDateTime,
    fileName: attachment.name,
    contentType: attachment.contentType,
    size: attachment.size,
    trust: { level: trust.level, reasons: trust.reasons },
    verdict: { kind: 'unread', reason: '' },
  };
  // Never read a suspicious email's attachments.
  if (trust.level === 'suspicious') {
    item.verdict = { kind: 'suspicious', reasons: trust.reasons };
    return item;
  }
  let reading: ReviewedExtraction;
  try {
    reading = await read(auth, reader, message.id, attachment.id);
  } catch (error) {
    item.verdict = {
      kind: 'unread',
      reason: error instanceof Error ? error.message : "Bookie couldn't read this document.",
    };
    return item;
  }
  item.reading = reading;
  const ex = reading.extraction;
  if (ex.kind !== 'invoice') {
    item.verdict = {
      kind: 'not-invoice',
      documentKind: ex.kind,
      reason:
        ex.kind === 'credit-note'
          ? `A credit note, not a bill: check it by hand. ${ex.kindReason}`
          : ex.kindReason,
    };
    return item;
  }

  const evidence = supplierEvidence(ex, trust.facts.from);
  item.evidence = evidence;
  const contacts = await books.contacts();
  const supplier = matchSupplier(evidence, contacts);
  item.supplier = supplier;

  if (supplier.status === 'matched') {
    const contact = (await books.contact(supplier.contact.id)) ?? supplier.contact;
    item.supplier = { ...supplier, contact };
    item.diffs = supplierDiff(contact, evidence);
    item.bank = bankCheck(contact.bankDetails, ex.supplier.bankDetails);
    if (item.bank.status === 'differs' || item.bank.status === 'new') {
      item.verdict = {
        kind: 'suspicious',
        reasons: [
          item.bank.status === 'new'
            ? `The invoice gives bank details (${item.bank.printed}) and the supplier's record has none: verify by phone using a number you already hold, not the one on the invoice.`
            : `${BANK_WARNING} The invoice says: ${item.bank.printed}.`,
        ],
      };
      return item;
    }
    const match = findExistingBill(
      {
        supplierId: contact.id,
        invoiceNumber: ex.invoiceNumber,
        total: ex.total,
        date: ex.invoiceDate,
        currency: ex.currency,
      },
      await books.bills(contact.id, ex.invoiceNumber).catch(() => [])
    );
    if (match) {
      item.verdict = { kind: 'in-books', match };
      return item;
    }
  } else if (evidence.bankDetails) {
    // No single supplier to compare with: shown as a warning, never copied anywhere.
    item.bank = { status: 'unknown', printed: formatBankDetails(evidence.bankDetails.value) };
  }
  item.verdict = { kind: 'new' };
  return item;
}

async function pool<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await run(items[i]);
      }
    })
  );
  return out;
}

function ownDomainsFor(auth: AuthContext, reader: MailboxReader): string[] {
  return [domainOf(reader.mailbox), domainOf(auth.user.email)].filter((d): d is string => !!d);
}

/** The last `weeks` weeks of the mailbox: one item per PDF or image attachment. */
export async function reviewMailbox(
  auth: AuthContext,
  reader: MailboxReader,
  connector: AccountingConnector,
  weeks: number
): Promise<InboxItem[]> {
  const since = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString();
  const mailbox = reader.mailbox.toLowerCase();
  const messages = (await reader.list(since, MAX_MESSAGES)).filter(
    // Mail the mailbox sent itself (Sent Items) isn't a supplier's.
    (m) => m.from?.emailAddress?.address?.toLowerCase() !== mailbox
  );
  const books = booksLookup(connector);
  const own = ownDomainsFor(auth, reader);
  const jobs: { message: MailMessage; doc: ReturnType<typeof documentsOf>[number] }[] = [];
  const trust = new Map<string, TrustVerdict>();
  for (const message of messages) {
    const docs = documentsOf(message);
    if (!docs.length) continue;
    trust.set(message.id, await trustOf(message, books, own));
    for (const doc of docs) jobs.push({ message, doc });
  }
  return pool(jobs, CONCURRENCY, ({ message, doc }) =>
    reviewAttachment(auth, reader, books, message, doc, trust.get(message.id)!)
  );
}

/** One attachment, re-read from the mailbox (the bill page, and before any write). */
export async function reviewOne(
  auth: AuthContext,
  reader: MailboxReader,
  connector: AccountingConnector,
  messageId: string,
  attachmentId: string
): Promise<InboxItem | undefined> {
  const message = await reader.message(messageId);
  const doc = documentsOf(message).find((d) => d.id === attachmentId);
  if (!doc) return undefined;
  const books = booksLookup(connector);
  const trust = await trustOf(message, books, ownDomainsFor(auth, reader));
  return reviewAttachment(auth, reader, books, message, doc, trust);
}

/** Just the "is it genuine?" verdict for one email (the file preview refuses suspicious mail). */
export async function messageTrust(
  auth: AuthContext,
  reader: MailboxReader,
  connector: AccountingConnector,
  messageId: string
): Promise<{ message: MailMessage; trust: TrustVerdict }> {
  const message = await reader.message(messageId);
  const trust = await trustOf(message, booksLookup(connector), ownDomainsFor(auth, reader));
  return { message, trust };
}
