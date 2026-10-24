import type { Address, Contact, Invoice } from '@/lib/domain/types';
import { registrableDomain } from '@/lib/email/trust';
import type { ExtractedAddress, ExtractedBankDetails, Extraction } from './extraction';

/**
 * Matching an emailed document to the books: which supplier it is from, whether the
 * bill is already there, how the supplier's details differ, and the bank-details rule.
 * Pure functions; every result says why, and "several" or "none" is said plainly.
 */

/* ------------------------------------------------------------------ */
/* Supplier evidence, with where each value came from                  */
/* ------------------------------------------------------------------ */

export type EvidenceSource = 'document' | 'sender';

export interface Evidence<T> {
  value: T;
  source: EvidenceSource;
}

export interface SupplierEvidence {
  name?: Evidence<string>;
  address?: Evidence<ExtractedAddress>;
  taxNumber?: Evidence<string>;
  companyNumber?: Evidence<string>;
  email?: Evidence<string>;
  phone?: Evidence<string>;
  bankDetails?: Evidence<ExtractedBankDetails>;
  senderAddress?: Evidence<string>;
  senderDomain?: Evidence<string>;
}

const doc = <T>(value: T | null | undefined): Evidence<T> | undefined =>
  value === null || value === undefined || value === '' ? undefined : { value, source: 'document' };

export function hasBankDetails(bank: ExtractedBankDetails | null | undefined): boolean {
  return !!bank && !!(bank.iban || bank.accountNumber || bank.sortCode);
}

/** The supplier as the invoice prints it and as the email's sender shows it. */
export function supplierEvidence(
  extraction: Extraction | undefined,
  sender: string | null | undefined
): SupplierEvidence {
  const s = extraction?.supplier;
  const address = s?.address && Object.values(s.address).some(Boolean) ? s.address : undefined;
  const domain = sender?.split('@')[1]?.toLowerCase();
  return {
    name: doc(s?.name),
    address: doc(address),
    taxNumber: doc(s?.taxNumber),
    companyNumber: doc(s?.companyNumber),
    email: doc(s?.email),
    phone: doc(s?.phone),
    bankDetails: hasBankDetails(s?.bankDetails) ? doc(s?.bankDetails ?? undefined) : undefined,
    senderAddress: sender ? { value: sender.toLowerCase(), source: 'sender' } : undefined,
    senderDomain: domain ? { value: domain, source: 'sender' } : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Supplier matching: VAT number, then sender domain, then exact name  */
/* ------------------------------------------------------------------ */

export type SupplierMatch =
  | {
      status: 'matched';
      contact: Contact;
      by: 'tax-number' | 'sender-domain' | 'name';
      reason: string;
    }
  | {
      status: 'several';
      contacts: Contact[];
      by: 'tax-number' | 'sender-domain' | 'name';
      reason: string;
    }
  | { status: 'none'; reason: string };

/** `GB 123 4567 89` and `123456789` are the same VAT number. */
export function normaliseTaxNumber(value: string | undefined | null): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sameTaxNumber(a: string, b: string): boolean {
  const x = normaliseTaxNumber(a);
  const y = normaliseTaxNumber(b);
  if (!x || !y) return false;
  const bare = (v: string) => v.replace(/^[A-Z]{2}(?=\d)/, '');
  return x === y || bare(x) === bare(y);
}

const COMPANY_SUFFIX =
  /\b(ltd|limited|llc|inc|incorporated|plc|llp|gmbh|sa|sas|bv|co|company|corp|corporation)\b/g;

/** `The Contoso Coffee Co. Ltd` → `contoso coffee`. */
export function normaliseName(name: string | undefined | null): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/^\s*the\s+/, '')
    .replace(COMPANY_SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Webmail domains say nothing about which company sent the mail. */
const FREE_MAIL = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
]);

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL.has(domain.toLowerCase());
}

/** The registrable domains a contact is known by: its email and website. */
export function contactDomains(contact: Pick<Contact, 'email' | 'website'>): string[] {
  const out = new Set<string>();
  const email = contact.email?.split('@')[1];
  if (email) out.add(registrableDomain(email));
  if (contact.website) {
    const host = contact.website
      .replace(/^https?:\/\//i, '')
      .split(/[/?#]/)[0]
      .replace(/^www\./i, '');
    if (host.includes('.')) out.add(registrableDomain(host));
  }
  return [...out].filter((d) => !isFreeMailDomain(d));
}

export function matchSupplier(evidence: SupplierEvidence, contacts: Contact[]): SupplierMatch {
  const active = contacts.filter((c) => c.status === 'active');
  const result = (
    by: 'tax-number' | 'sender-domain' | 'name',
    found: Contact[],
    what: string
  ): SupplierMatch | undefined => {
    if (found.length === 1)
      return {
        status: 'matched',
        contact: found[0],
        by,
        reason: `${what} matches ${found[0].name}`,
      };
    if (found.length > 1)
      return {
        status: 'several',
        contacts: found,
        by,
        reason: `${what} matches ${found.length} contacts: ${found.map((c) => c.name).join(', ')}`,
      };
    return undefined;
  };

  const tax = evidence.taxNumber?.value;
  if (tax) {
    const hit = result(
      'tax-number',
      active.filter((c) => c.taxNumber && sameTaxNumber(c.taxNumber, tax)),
      `VAT number ${tax} (from the document)`
    );
    if (hit) return hit;
  }
  const domain = evidence.senderDomain?.value;
  if (domain && !isFreeMailDomain(domain)) {
    const reg = registrableDomain(domain);
    const hit = result(
      'sender-domain',
      active.filter((c) => contactDomains(c).includes(reg)),
      `Sender domain ${domain} (from the sender)`
    );
    if (hit) return hit;
  }
  const name = normaliseName(evidence.name?.value);
  if (name) {
    const hit = result(
      'name',
      active.filter((c) => normaliseName(c.name) === name),
      `Name "${evidence.name?.value}" (from the document)`
    );
    if (hit) return hit;
  }
  const tried = [
    tax && 'VAT number',
    domain && (isFreeMailDomain(domain) ? undefined : 'sender domain'),
    name && 'name',
  ].filter(Boolean);
  return {
    status: 'none',
    reason: tried.length
      ? `No contact matches the ${tried.join(', ')}.`
      : 'The document and email give nothing to match a contact on.',
  };
}

/* ------------------------------------------------------------------ */
/* Already in the books?                                               */
/* ------------------------------------------------------------------ */

/** Case-insensitive, ignoring spaces, punctuation and leading zeros: `inv 00431` = `INV-431`. */
export function normaliseInvoiceNumber(value: string | undefined | null): string {
  return (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .replace(/(^|[^0-9])0+(?=\d)/g, '$1');
}

export type BillMatch =
  | { status: 'same'; bill: Invoice; by: 'number' | 'amount-date'; reason: string }
  | { status: 'different'; bill: Invoice; reason: string };

export interface BillQuery {
  supplierId: string;
  invoiceNumber: string | null;
  total: number | null;
  date: string | null;
  currency: string | null;
}

const money = (n: number) => n.toFixed(2);

/**
 * Supplier + invoice number (the bill's number or reference), or supplier + total + date.
 * Same supplier and number with a different total, date or currency is "different in the
 * books" (a possible revised invoice), never a second bill.
 */
export function findExistingBill(query: BillQuery, bills: Invoice[]): BillMatch | undefined {
  const own = bills.filter(
    (b) =>
      b.type === 'purchase' &&
      b.contact.id === query.supplierId &&
      b.status !== 'deleted' &&
      b.status !== 'voided'
  );
  const number = normaliseInvoiceNumber(query.invoiceNumber);
  if (number) {
    const byNumber = own.find(
      (b) =>
        normaliseInvoiceNumber(b.number) === number ||
        normaliseInvoiceNumber(b.reference) === number
    );
    if (byNumber) {
      const differences: string[] = [];
      if (query.total !== null && Math.abs(byNumber.total - query.total) >= 0.005)
        differences.push(
          `total ${money(byNumber.total)} in the books, ${money(query.total)} on the document`
        );
      if (query.date && byNumber.date && byNumber.date !== query.date)
        differences.push(`date ${byNumber.date} in the books, ${query.date} on the document`);
      if (query.currency && byNumber.currency && byNumber.currency !== query.currency)
        differences.push(
          `currency ${byNumber.currency} in the books, ${query.currency} on the document`
        );
      return differences.length
        ? {
            status: 'different',
            bill: byNumber,
            reason: `Same supplier and number, but ${differences.join('; ')}`,
          }
        : {
            status: 'same',
            bill: byNumber,
            by: 'number',
            reason: `Same supplier and invoice number ${query.invoiceNumber}`,
          };
    }
  }
  if (query.total !== null && query.date) {
    const byAmount = own.find(
      (b) =>
        Math.abs(b.total - (query.total ?? NaN)) < 0.005 &&
        b.date === query.date &&
        // The weaker match needs the same, known currency on both sides.
        !!query.currency &&
        b.currency === query.currency
    );
    if (byAmount)
      return {
        status: 'same',
        bill: byAmount,
        by: 'amount-date',
        reason: `Same supplier, total ${money(query.total)} and date ${query.date}`,
      };
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Supplier details that differ (proposed, never applied automatically) */
/* ------------------------------------------------------------------ */

export type DiffField = 'address' | 'email' | 'phone' | 'taxNumber';

export interface FieldDiff {
  field: DiffField;
  label: string;
  /** What the books hold, formatted; `undefined` when empty. */
  current?: string;
  proposed: string;
  /** The value to write if the person ticks it. */
  value: string | Address;
}

export function formatAddress(
  a: { [K in keyof Address]?: string | null } | null | undefined
): string | undefined {
  if (!a) return undefined;
  const text = [a.line1, a.line2, a.city, a.region, a.postalCode, a.country]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');
  return text || undefined;
}

const squash = (v: string | undefined) => (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The last nine digits: `+44 117 496 0200` = `0117 496 0200`. */
const phoneKey = (v: string | undefined) => (v ?? '').replace(/\D/g, '').slice(-9);

/**
 * Address, email, phone and VAT number from the document that differ from the
 * contact's record. Only values the document prints are proposed (never clearing a
 * field), and bank details are never part of it.
 */
export function supplierDiff(contact: Contact, evidence: SupplierEvidence): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const address = evidence.address?.value;
  if (address && Object.values(address).some(Boolean)) {
    const old = contact.address ?? {};
    const printed = (v: string | null | undefined) => v?.trim() || undefined;
    // A printed street line replaces both street lines; any other part the document
    // doesn't print keeps the record's value (never cleared because it wasn't printed).
    const newStreet = !!printed(address.line1);
    const value: Address = {
      line1: printed(address.line1) ?? old.line1 ?? '',
      line2: newStreet
        ? (printed(address.line2) ?? '')
        : (printed(address.line2) ?? old.line2 ?? ''),
      city: printed(address.city) ?? old.city ?? '',
      region: printed(address.region) ?? old.region ?? '',
      postalCode: printed(address.postalCode) ?? old.postalCode ?? '',
      country: printed(address.country) ?? old.country ?? '',
    };
    const proposed = formatAddress(value);
    const current = formatAddress(contact.address);
    if (proposed && squash(proposed) !== squash(current))
      diffs.push({ field: 'address', label: 'Address', current, proposed, value });
  }
  const email = evidence.email?.value?.trim();
  if (email && email.toLowerCase() !== (contact.email ?? '').trim().toLowerCase())
    diffs.push({
      field: 'email',
      label: 'Email',
      current: contact.email,
      proposed: email,
      value: email,
    });
  const phone = evidence.phone?.value?.trim();
  if (phone && phoneKey(phone) !== phoneKey(contact.phone))
    diffs.push({
      field: 'phone',
      label: 'Phone',
      current: contact.phone,
      proposed: phone,
      value: phone,
    });
  const tax = evidence.taxNumber?.value?.trim();
  if (tax && !(contact.taxNumber && sameTaxNumber(contact.taxNumber, tax)))
    diffs.push({
      field: 'taxNumber',
      label: 'VAT number',
      current: contact.taxNumber,
      proposed: tax,
      value: tax,
    });
  return diffs;
}

/* ------------------------------------------------------------------ */
/* Bank details: compared, never proposed or applied                   */
/* ------------------------------------------------------------------ */

export type BankCheck =
  | { status: 'none-on-document' }
  | { status: 'matches' }
  /** The supplier's record has different bank details. Suspicious. */
  | { status: 'differs'; printed: string }
  /** The record has no bank details, the invoice brings some. Suspicious. */
  | { status: 'new'; printed: string }
  /** The source doesn't expose bank details (Business Central), so they can't be compared. */
  | { status: 'unknown'; printed: string };

export function formatBankDetails(bank: ExtractedBankDetails): string {
  return [
    bank.accountName,
    bank.sortCode && `sort code ${bank.sortCode}`,
    bank.accountNumber && `account ${bank.accountNumber}`,
    bank.iban && `IBAN ${bank.iban}`,
    bank.bic && `BIC ${bank.bic}`,
  ]
    .filter(Boolean)
    .join(', ');
}

const alnum = (v: string | null | undefined) => (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Compare the invoice's bank details with the supplier's record. A changed or new bank
 * account on an invoice is the classic invoice-fraud signal, so `differs` and `new` make
 * the email suspicious, and Bookie never offers to copy bank details to the record.
 */
export function bankCheck(
  record: string | null | undefined,
  printed: ExtractedBankDetails | null | undefined
): BankCheck {
  if (!printed || !hasBankDetails(printed)) return { status: 'none-on-document' };
  const text = formatBankDetails(printed);
  if (record === undefined) return { status: 'unknown', printed: text };
  if (record === null || !alnum(record)) return { status: 'new', printed: text };
  const on = alnum(record);
  const iban = alnum(printed.iban);
  const account = alnum(printed.accountNumber);
  const sort = alnum(printed.sortCode);
  const ibanOk = !iban || on.includes(iban);
  const accountOk = !account || on.includes(account) || (!!iban && iban.endsWith(account));
  const sortOk = !sort || on.includes(sort) || (!!iban && iban.includes(sort));
  return ibanOk && accountOk && sortOk
    ? { status: 'matches' }
    : { status: 'differs', printed: text };
}

export const BANK_WARNING =
  "Bank details on this invoice differ from the supplier's record: verify by phone using a number you already hold, not the one on the invoice.";
