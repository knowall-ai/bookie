import type { LineAmountType, ListQuery, Quote, QuoteInput, QuoteStatus } from '@/lib/domain/types';
import type { QuotesModule, QuoteStatusChange } from '../../types';
import { ConnectorError } from '../../types';
import { xeroDate, xeroTimestamp, type XeroClient } from '../client';
import {
  fromXeroLineItem,
  toXeroLineItem,
  xeroRate,
  type XeroInvoice,
  type XeroLineItem,
} from '../mappers';
import { xeroDeepLink } from '../index';
import { matchesSearch } from '../../search';

/** Xero pages quotes at a fixed 100 and ignores `pageSize`. */
const XERO_QUOTES_PAGE = 100;

export interface XeroQuote {
  QuoteID: string;
  QuoteNumber?: string;
  Reference?: string;
  Title?: string;
  Summary?: string;
  Terms?: string;
  Contact: { ContactID: string; Name: string };
  Date?: string;
  DateString?: string;
  ExpiryDate?: string | null;
  ExpiryDateString?: string | null;
  Status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'INVOICED' | 'DELETED';
  /** Quotes use upper case here, unlike invoices. */
  LineAmountTypes?: 'EXCLUSIVE' | 'INCLUSIVE' | 'NOTAX';
  CurrencyCode?: string;
  CurrencyRate?: number;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  LineItems?: XeroLineItem[];
  UpdatedDateUTC?: string;
}

const STATUS: Record<XeroQuote['Status'], QuoteStatus> = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  INVOICED: 'invoiced',
  DELETED: 'deleted',
};

const TO_XERO_STATUS: Record<QuoteStatus, XeroQuote['Status']> = {
  draft: 'DRAFT',
  sent: 'SENT',
  accepted: 'ACCEPTED',
  declined: 'DECLINED',
  invoiced: 'INVOICED',
  deleted: 'DELETED',
};

function fromQuoteLineAmountTypes(value?: string): LineAmountType | undefined {
  switch (value?.toUpperCase()) {
    case 'EXCLUSIVE':
      return 'exclusive';
    case 'INCLUSIVE':
      return 'inclusive';
    case 'NOTAX':
      return 'none';
    default:
      return undefined;
  }
}

function toQuoteLineAmountTypes(value?: LineAmountType): XeroQuote['LineAmountTypes'] {
  return value === 'inclusive' ? 'INCLUSIVE' : value === 'none' ? 'NOTAX' : 'EXCLUSIVE';
}

export function fromXeroQuote(raw: XeroQuote): Quote {
  return {
    id: raw.QuoteID,
    number: raw.QuoteNumber || '',
    reference: raw.Reference || undefined,
    title: raw.Title || undefined,
    summary: raw.Summary || undefined,
    terms: raw.Terms || undefined,
    contact: { id: raw.Contact.ContactID, name: raw.Contact.Name },
    date: xeroDate(raw.DateString ?? raw.Date) ?? '',
    expiryDate: xeroDate(raw.ExpiryDateString ?? raw.ExpiryDate),
    status: STATUS[raw.Status] ?? 'draft',
    currency: raw.CurrencyCode ?? '',
    currencyRate: xeroRate(raw.CurrencyRate),
    lineAmountType: fromQuoteLineAmountTypes(raw.LineAmountTypes),
    subTotal: raw.SubTotal ?? 0,
    totalTax: raw.TotalTax ?? 0,
    total: raw.Total ?? 0,
    lineItems: raw.LineItems?.map(fromXeroLineItem),
    updatedAt: xeroTimestamp(raw.UpdatedDateUTC),
  };
}

export function toXeroQuote(input: QuoteInput, id?: string): Record<string, unknown> {
  return {
    ...(id ? { QuoteID: id } : {}),
    Contact: { ContactID: input.contactId },
    Date: input.date,
    ExpiryDate: input.expiryDate,
    QuoteNumber: input.number || undefined,
    Reference: input.reference || undefined,
    Title: input.title || undefined,
    Summary: input.summary || undefined,
    Terms: input.terms || undefined,
    CurrencyCode: input.currency || undefined,
    CurrencyRate: input.currency ? xeroRate(input.currencyRate) : undefined,
    LineAmountTypes: toQuoteLineAmountTypes(input.lineAmountType),
    LineItems: input.lineItems.map(toXeroLineItem),
  };
}

/** A draft ACCREC invoice carrying the quote's contact, lines and number as reference. */
export function invoiceFromXeroQuote(quote: XeroQuote): Record<string, unknown> {
  const lineAmountType = fromQuoteLineAmountTypes(quote.LineAmountTypes);
  return {
    Type: 'ACCREC',
    Contact: { ContactID: quote.Contact.ContactID },
    Date: new Date().toISOString().slice(0, 10),
    Reference: quote.QuoteNumber || quote.Reference || undefined,
    CurrencyCode: quote.CurrencyCode || undefined,
    LineAmountTypes:
      lineAmountType === 'inclusive'
        ? 'Inclusive'
        : lineAmountType === 'none'
          ? 'NoTax'
          : 'Exclusive',
    Status: 'DRAFT',
    LineItems: (quote.LineItems ?? []).map((l) => ({
      ItemCode: l.ItemCode || undefined,
      Description: l.Description,
      Quantity: l.Quantity,
      UnitAmount: l.UnitAmount,
      DiscountRate: l.DiscountRate || undefined,
      AccountCode: l.AccountCode || undefined,
      TaxType: l.TaxType || undefined,
    })),
  };
}

/** Xero's quote lifecycle: which status changes are legal from where. */
const TRANSITIONS: Record<QuoteStatusChange, QuoteStatus[]> = {
  sent: ['draft', 'accepted', 'declined'],
  accepted: ['sent'],
  declined: ['sent'],
  deleted: ['draft', 'sent'],
};

export function xeroQuotes(client: XeroClient, shortCode?: string): QuotesModule | undefined {
  const link = (quote: Quote): Quote => ({
    ...quote,
    sourceUrl: xeroDeepLink(shortCode, `/Accounts/Receivable/Quotes/View/${quote.id}`),
  });
  const raw = async (id: string) => {
    const result = await client.request<{ Quotes: XeroQuote[] }>(`Quotes/${id}`);
    const quote = result.Quotes?.[0];
    if (!quote) throw new ConnectorError('Quote not found.', 404, 'xero');
    return quote;
  };
  const save = async (body: Record<string, unknown>) => {
    const result = await client.request<{ Quotes: XeroQuote[] }>('Quotes', {
      method: 'POST',
      body: { Quotes: [body] },
    });
    return link(fromXeroQuote(result.Quotes[0]));
  };
  // Xero rejects a status change that does not also restate the contact and date.
  const changeStatus = async (quote: XeroQuote, status: QuoteStatus) =>
    save({
      QuoteID: quote.QuoteID,
      Contact: { ContactID: quote.Contact.ContactID },
      Date: xeroDate(quote.DateString ?? quote.Date),
      Status: TO_XERO_STATUS[status],
    });

  return {
    async list(query?: ListQuery) {
      const result = await client.request<{ Quotes: XeroQuote[] }>('Quotes', {
        query: {
          Status:
            query?.status && query.status !== 'all'
              ? TO_XERO_STATUS[query.status as QuoteStatus]
              : undefined,
          ContactID: query?.contactId,
          DateFrom: query?.from,
          DateTo: query?.to,
          order: 'Date DESC',
          page: query?.page ?? 1,
        },
      });
      const all = result.Quotes ?? [];
      // The Quotes endpoint has no search term; filter the page we got.
      const items = all
        .map(fromXeroQuote)
        .map(link)
        .filter((q) => q.status !== 'deleted' || query?.status === 'deleted')
        .filter((q) =>
          matchesSearch([q.number, q.reference, q.title, q.contact.name], query?.search)
        );
      return {
        items,
        page: query?.page ?? 1,
        pageSize: XERO_QUOTES_PAGE,
        hasMore: all.length >= XERO_QUOTES_PAGE,
      };
    },
    get: async (id) => link(fromXeroQuote(await raw(id))),
    create: (input) => save({ ...toXeroQuote(input), Status: 'DRAFT' }),
    async update(id, input) {
      const existing = await raw(id);
      return save({ ...toXeroQuote(input, id), Status: existing.Status });
    },
    statusChanges: ['sent', 'accepted', 'declined', 'deleted'],
    async setStatus(id, status) {
      const quote = await raw(id);
      const from = STATUS[quote.Status];
      if (!TRANSITIONS[status].includes(from)) {
        throw new ConnectorError(`A ${from} quote can't be marked as ${status}.`, 409, 'xero');
      }
      return changeStatus(quote, status);
    },
    convertibleStatuses: ['sent', 'accepted'],
    async convertToInvoice(id) {
      // Xero has no "convert" endpoint: create the invoice, then mark the quote invoiced
      // (Xero only allows INVOICED from ACCEPTED).
      let quote = await raw(id);
      if (quote.Status === 'SENT') {
        await changeStatus(quote, 'accepted');
        quote = await raw(id);
      }
      if (quote.Status !== 'ACCEPTED') {
        throw new ConnectorError('Only sent or accepted quotes can be invoiced.', 409, 'xero');
      }
      const created = await client.request<{ Invoices: XeroInvoice[] }>('Invoices', {
        method: 'POST',
        body: { Invoices: [invoiceFromXeroQuote(quote)] },
      });
      await changeStatus(quote, 'invoiced');
      return { invoiceId: created.Invoices[0]?.InvoiceID };
    },
    pdf: (id) => client.request<ArrayBuffer>(`Quotes/${id}`, { accept: 'application/pdf' }),
  };
}
