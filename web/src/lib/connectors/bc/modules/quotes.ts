import type { ListQuery, Quote, QuoteInput, QuoteStatus } from '@/lib/domain/types';
import type { QuotesModule } from '../../types';
import { ConnectorError } from '../../types';
import { odataString, type BcClient, type ODataList } from '../client';
import { bcDate, parseContactId } from '../index';
import { fromBcDocumentLine, toBcDocumentLine, type BcDocumentLine } from './document-lines';

const DEFAULT_PAGE_SIZE = 50;

export interface BcSalesQuote {
  id: string;
  number: string;
  externalDocumentNumber?: string;
  documentDate?: string;
  validUntilDate?: string;
  customerId: string;
  customerName: string;
  currencyCode?: string;
  status: string;
  totalAmountExcludingTax?: number;
  totalTaxAmount?: number;
  totalAmountIncludingTax?: number;
  lastModifiedDateTime?: string;
  salesQuoteLines?: BcDocumentLine[];
}

/** BC quote statuses: Draft, Sent, Accepted, Expired. An expired quote was sent and lapsed. */
export function bcQuoteStatus(status: string): QuoteStatus {
  switch (status.trim()) {
    case 'Draft':
      return 'draft';
    case 'Accepted':
      return 'accepted';
    default:
      return 'sent';
  }
}

const STATUS_FILTER: Partial<Record<QuoteStatus, string>> = {
  draft: "status eq 'Draft'",
  sent: "(status eq 'Sent' or status eq 'Expired')",
  accepted: "status eq 'Accepted'",
};

export function fromBcSalesQuote(raw: BcSalesQuote, lcy: string): Quote {
  return {
    id: raw.id,
    number: raw.number,
    reference: raw.externalDocumentNumber || undefined,
    contact: { id: `c:${raw.customerId}`, name: raw.customerName },
    date: bcDate(raw.documentDate) ?? '',
    expiryDate: bcDate(raw.validUntilDate),
    status: bcQuoteStatus(raw.status),
    currency: raw.currencyCode || lcy,
    // Sales quotes carry no "prices include tax" flag in API v2.0.
    lineAmountType: 'exclusive',
    subTotal: raw.totalAmountExcludingTax ?? 0,
    totalTax: raw.totalTaxAmount ?? 0,
    total: raw.totalAmountIncludingTax ?? 0,
    lineItems: raw.salesQuoteLines?.map(fromBcDocumentLine),
    updatedAt: raw.lastModifiedDateTime,
  };
}

export function toBcSalesQuote(input: QuoteInput) {
  return {
    customerId: parseContactId(input.contactId).id,
    documentDate: input.date,
    validUntilDate: input.expiryDate,
    externalDocumentNumber: input.reference,
    currencyCode: input.currency,
  };
}

/**
 * Business Central sales quotes. BC has no "declined" state and its "Sent"
 * status is set by emailing the quote (Microsoft.NAV.send), so Bookie only
 * offers delete here; title, summary and terms have no API fields.
 */
export function bcQuotes(client: BcClient, lcy: () => Promise<string>): QuotesModule | undefined {
  const getRaw = (id: string) =>
    client.request<BcSalesQuote>(`salesQuotes(${id})`, { query: { $expand: 'salesQuoteLines' } });

  const writeLines = async (id: string, input: QuoteInput) => {
    for (const line of input.lineItems) {
      await client.request(`salesQuotes(${id})/salesQuoteLines`, {
        method: 'POST',
        body: toBcDocumentLine(line, 'unitPrice'),
      });
    }
  };

  const mod: QuotesModule = {
    async list(query?: ListQuery) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const filters: string[] = [];
      const status = query?.status as QuoteStatus | undefined;
      if (status && status !== ('all' as QuoteStatus)) {
        const f = STATUS_FILTER[status];
        // Declined/invoiced quotes don't exist in BC (makeInvoice deletes the quote).
        if (!f) return { items: [], page, pageSize, hasMore: false };
        filters.push(f);
      }
      if (query?.from) filters.push(`documentDate ge ${query.from}`);
      if (query?.to) filters.push(`documentDate le ${query.to}`);
      if (query?.contactId) filters.push(`customerId eq ${parseContactId(query.contactId).id}`);
      if (query?.search) {
        const s = odataString(query.search);
        filters.push(
          `(contains(number,${s}) or contains(customerName,${s}) or contains(externalDocumentNumber,${s}))`
        );
      }
      const result = await client.request<ODataList<BcSalesQuote>>('salesQuotes', {
        query: {
          $filter: filters.join(' and ') || undefined,
          $orderby: 'documentDate desc,number desc',
          $top: pageSize + 1,
          $skip: (page - 1) * pageSize,
        },
      });
      const currency = await lcy();
      return {
        items: result.value.slice(0, pageSize).map((q) => fromBcSalesQuote(q, currency)),
        page,
        pageSize,
        hasMore: result.value.length > pageSize,
      };
    },
    async get(id) {
      return fromBcSalesQuote(await getRaw(id), await lcy());
    },
    async create(input) {
      const created = await client.request<{ id: string }>('salesQuotes', {
        method: 'POST',
        body: toBcSalesQuote(input),
      });
      await writeLines(created.id, input);
      return mod.get(created.id);
    },
    async update(id, input) {
      const raw = await getRaw(id);
      if (raw.status !== 'Draft') {
        throw new ConnectorError(
          'Only draft quotes can be edited in Business Central.',
          409,
          'business-central'
        );
      }
      await client.request(`salesQuotes(${id})`, {
        method: 'PATCH',
        etag: '*',
        body: toBcSalesQuote(input),
      });
      for (const line of raw.salesQuoteLines ?? []) {
        await client.request(`salesQuotes(${id})/salesQuoteLines(${line.id})`, {
          method: 'DELETE',
          etag: '*',
        });
      }
      await writeLines(id, input);
      return mod.get(id);
    },
    statusChanges: ['deleted'],
    async setStatus(id, status) {
      if (status !== 'deleted') {
        throw new ConnectorError(
          `Business Central doesn't let you mark a quote as ${status}.`,
          409,
          'business-central'
        );
      }
      const quote = await mod.get(id);
      await client.request(`salesQuotes(${id})`, { method: 'DELETE', etag: '*' });
      return { ...quote, status: 'deleted' };
    },
    convertibleStatuses: ['draft', 'sent', 'accepted'],
    async convertToInvoice(id) {
      const quote = await getRaw(id);
      const started = new Date(Date.now() - 60_000).toISOString();
      // makeInvoice creates a draft sales invoice and removes the quote.
      await client.request(`salesQuotes(${id})/Microsoft.NAV.makeInvoice`, { method: 'POST' });
      const invoices = await client.request<ODataList<{ id: string }>>('salesInvoices', {
        query: {
          $filter: `customerId eq ${quote.customerId} and status eq 'Draft' and lastModifiedDateTime ge ${started}`,
          $orderby: 'lastModifiedDateTime desc',
          $top: 1,
          $select: 'id',
        },
      });
      return { invoiceId: invoices.value[0]?.id };
    },
    async pdf(id) {
      const docs = await client.request<ODataList<{ id: string }>>(
        `salesQuotes(${id})/pdfDocument`
      );
      const doc = docs.value[0];
      if (!doc) throw new ConnectorError('No PDF available.', 404, 'business-central');
      return client.request<ArrayBuffer>(
        `salesQuotes(${id})/pdfDocument(${doc.id})/pdfDocumentContent`,
        { raw: true }
      );
    },
  };
  return mod;
}
