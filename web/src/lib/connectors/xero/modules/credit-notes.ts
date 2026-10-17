import type {
  AllocationInput,
  CreditAllocation,
  CreditNote,
  CreditNoteInput,
  InvoiceStatus,
} from '@/lib/domain/types';
import type { CreditNotesModule } from '../../types';
import { ConnectorError } from '../../types';
import { xeroDate, xeroString, xeroTimestamp, type XeroClient } from '../client';
import { matchesSearch } from '../../search';
import {
  fromLineAmountTypes,
  fromXeroLineItem,
  xeroRate,
  toLineAmountTypes,
  toXeroLineItem,
  XERO_INVOICE_STATUS,
  type XeroLineItem,
} from '../mappers';
import { xeroDeepLink } from '../index';

const DEFAULT_PAGE_SIZE = 50;

export interface XeroAllocation {
  AllocationID?: string;
  Amount?: number;
  Date?: string;
  Invoice?: { InvoiceID: string; InvoiceNumber?: string };
}

export interface XeroCreditNote {
  CreditNoteID: string;
  CreditNoteNumber?: string;
  Type: 'ACCRECCREDIT' | 'ACCPAYCREDIT';
  Reference?: string;
  Contact: { ContactID: string; Name: string };
  Date?: string;
  DateString?: string;
  Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED' | 'DELETED';
  LineAmountTypes?: 'Exclusive' | 'Inclusive' | 'NoTax';
  CurrencyCode?: string;
  CurrencyRate?: number;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  RemainingCredit?: number;
  LineItems?: XeroLineItem[];
  Allocations?: XeroAllocation[];
  UpdatedDateUTC?: string;
}

const STATUS: Record<XeroCreditNote['Status'], InvoiceStatus> = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  AUTHORISED: 'authorised',
  PAID: 'paid',
  VOIDED: 'voided',
  DELETED: 'deleted',
};

export function fromXeroAllocation(raw: XeroAllocation): CreditAllocation | undefined {
  if (!raw.Invoice?.InvoiceID || typeof raw.Amount !== 'number') return undefined;
  return {
    id: raw.AllocationID,
    date: xeroDate(raw.Date),
    amount: raw.Amount,
    invoice: { id: raw.Invoice.InvoiceID, number: raw.Invoice.InvoiceNumber || undefined },
  };
}

export function fromXeroCreditNote(raw: XeroCreditNote): CreditNote {
  const status = STATUS[raw.Status] ?? 'draft';
  return {
    id: raw.CreditNoteID,
    type: raw.Type === 'ACCPAYCREDIT' ? 'purchase' : 'sales',
    number: raw.CreditNoteNumber || '',
    reference: raw.Reference || undefined,
    contact: { id: raw.Contact.ContactID, name: raw.Contact.Name },
    date: xeroDate(raw.DateString ?? raw.Date) ?? '',
    status,
    currency: raw.CurrencyCode ?? '',
    currencyRate: xeroRate(raw.CurrencyRate),
    lineAmountType: fromLineAmountTypes(raw.LineAmountTypes),
    subTotal: raw.SubTotal ?? 0,
    totalTax: raw.TotalTax ?? 0,
    total: raw.Total ?? 0,
    // Xero reports RemainingCredit on drafts too; nothing is allocatable until approved,
    // and a voided note has none left. Otherwise trust Xero's own figure (no fallback).
    remainingCredit:
      status === 'voided' || status === 'deleted'
        ? 0
        : status === 'draft' || status === 'submitted'
          ? raw.Total
          : raw.RemainingCredit,
    lineItems: raw.LineItems?.map(fromXeroLineItem),
    allocations: raw.Allocations?.map(fromXeroAllocation).filter((a): a is CreditAllocation => !!a),
    updatedAt: xeroTimestamp(raw.UpdatedDateUTC),
  };
}

export function toXeroCreditNote(input: CreditNoteInput, id?: string): Record<string, unknown> {
  return {
    ...(id ? { CreditNoteID: id } : {}),
    Type: input.type === 'purchase' ? 'ACCPAYCREDIT' : 'ACCRECCREDIT',
    Contact: { ContactID: input.contactId },
    Date: input.date,
    CreditNoteNumber: input.number || undefined,
    Reference: input.reference || undefined,
    CurrencyCode: input.currency || undefined,
    LineAmountTypes: toLineAmountTypes(input.lineAmountType),
    Status: input.status === 'authorised' ? 'AUTHORISED' : 'DRAFT',
    LineItems: input.lineItems.map(toXeroLineItem),
  };
}

/** Body for `PUT CreditNotes/{id}/Allocations`. */
export function toXeroAllocation(input: AllocationInput) {
  return {
    Allocations: [
      { Invoice: { InvoiceID: input.invoiceId }, Amount: input.amount, Date: input.date },
    ],
  };
}

export function xeroCreditNotes(client: XeroClient, shortCode?: string): CreditNotesModule {
  const link = (note: CreditNote): CreditNote => ({
    ...note,
    sourceUrl: xeroDeepLink(
      shortCode,
      note.type === 'sales'
        ? `/AccountsReceivable/ViewCreditNote.aspx?creditNoteID=${note.id}`
        : `/AccountsPayable/ViewCreditNote.aspx?creditNoteID=${note.id}`
    ),
  });
  const getOne = async (id: string) => {
    const result = await client.request<{ CreditNotes: XeroCreditNote[] }>(
      `CreditNotes/${encodeURIComponent(id)}`
    );
    const raw = result.CreditNotes?.[0];
    if (!raw) throw new ConnectorError('Credit note not found.', 404, 'xero');
    return link(fromXeroCreditNote(raw));
  };
  const save = async (body: Record<string, unknown>) => {
    const result = await client.request<{ CreditNotes: XeroCreditNote[] }>('CreditNotes', {
      method: 'POST',
      body: { CreditNotes: [body] },
    });
    return link(fromXeroCreditNote(result.CreditNotes[0]));
  };

  return {
    async list(type, query) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const where = [`Type=="${type === 'sales' ? 'ACCRECCREDIT' : 'ACCPAYCREDIT'}"`];
      if (query?.contactId) where.push(`Contact.ContactID==guid("${xeroString(query.contactId)}")`);
      if (query?.from) where.push(`Date>=DateTime(${query.from.replaceAll('-', ',')})`);
      if (query?.to) where.push(`Date<=DateTime(${query.to.replaceAll('-', ',')})`);
      const status =
        !query?.status || query.status === 'all'
          ? 'DRAFT,SUBMITTED,AUTHORISED,PAID'
          : XERO_INVOICE_STATUS[query.status as InvoiceStatus];
      if (status)
        where.push(
          `(${status
            .split(',')
            .map((s) => `Status=="${s}"`)
            .join(' OR ')})`
        );
      const page = query?.page ?? 1;
      const result = await client.request<{ CreditNotes: XeroCreditNote[] }>('CreditNotes', {
        query: {
          where: where.join(' AND '),
          order: 'Date DESC',
          page,
          pageSize,
        },
      });
      const all = result.CreditNotes ?? [];
      // CreditNotes has no search term; filter the page we got.
      const items = all
        .map(fromXeroCreditNote)
        .map(link)
        .filter((c) => matchesSearch([c.number, c.reference, c.contact.name], query?.search));
      return { items, page, pageSize, hasMore: all.length >= pageSize };
    },
    get: getOne,
    create: (input) => save(toXeroCreditNote(input)),
    async update(id, input) {
      const existing = await getOne(id);
      if (existing.status !== 'draft' && existing.status !== 'submitted') {
        throw new ConnectorError('Only draft credit notes can be edited.', 409, 'xero');
      }
      return save(toXeroCreditNote(input, id));
    },
    approve: (id) => save({ CreditNoteID: id, Status: 'AUTHORISED' }),
    void: (id) => save({ CreditNoteID: id, Status: 'VOIDED' }),
    async delete(id) {
      await save({ CreditNoteID: id, Status: 'DELETED' });
    },
    async allocate(id, input) {
      await client.request(`CreditNotes/${encodeURIComponent(id)}/Allocations`, {
        method: 'PUT',
        body: toXeroAllocation(input),
      });
      return getOne(id);
    },
  };
}
