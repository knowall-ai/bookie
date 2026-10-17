import type { CreditNote, InvoiceStatus } from '@/lib/domain/types';
import type { CreditNotesModule } from '../../types';
import { ConnectorError } from '../../types';
import { xeroDate, xeroString, type XeroClient } from '../client';
import { matchesSearch } from '../../search';
import { fromXeroLineItem, XERO_INVOICE_STATUS, type XeroLineItem } from '../mappers';

const DEFAULT_PAGE_SIZE = 50;

export interface XeroCreditNote {
  CreditNoteID: string;
  CreditNoteNumber?: string;
  Type: 'ACCRECCREDIT' | 'ACCPAYCREDIT';
  Reference?: string;
  Contact: { ContactID: string; Name: string };
  Date?: string;
  DateString?: string;
  Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED' | 'DELETED';
  CurrencyCode?: string;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  RemainingCredit?: number;
  LineItems?: XeroLineItem[];
}

const STATUS: Record<XeroCreditNote['Status'], InvoiceStatus> = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  AUTHORISED: 'authorised',
  PAID: 'paid',
  VOIDED: 'voided',
  DELETED: 'deleted',
};

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
    subTotal: raw.SubTotal ?? 0,
    totalTax: raw.TotalTax ?? 0,
    total: raw.Total ?? 0,
    // Approved: what Xero reports (unknown if it didn't). Unapproved notes can't have been
    // allocated, so all of it remains; paid (fully allocated) and voided have none left.
    remainingCredit:
      status === 'authorised'
        ? raw.RemainingCredit
        : status === 'draft' || status === 'submitted'
          ? raw.Total
          : 0,
    lineItems: raw.LineItems?.map(fromXeroLineItem),
  };
}

export function xeroCreditNotes(client: XeroClient): CreditNotesModule | undefined {
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
        .filter((c) => matchesSearch([c.number, c.reference, c.contact.name], query?.search));
      return { items, page, pageSize, hasMore: all.length >= pageSize };
    },
    async get(id) {
      const result = await client.request<{ CreditNotes: XeroCreditNote[] }>(`CreditNotes/${id}`);
      const raw = result.CreditNotes?.[0];
      if (!raw) throw new ConnectorError('Credit note not found.', 404, 'xero');
      return fromXeroCreditNote(raw);
    },
  };
}
