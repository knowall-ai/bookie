import type { CreditNote, CreditNoteType, InvoiceStatus } from '@/lib/domain/types';
import type { CreditNotesModule } from '../../types';
import { ConnectorError } from '../../types';
import { odataString, type BcClient, type ODataList } from '../client';
import { bcDate, parseContactId } from '../index';
import { fromBcDocumentLine, type BcDocumentLine } from './document-lines';

const DEFAULT_PAGE_SIZE = 50;

export const BC_CREDIT_REMAINING_NOTE =
  "Business Central's API doesn't report how much of a posted credit memo is still to be applied, so remaining credit on open credit notes shows as not available.";

export interface BcCreditMemo {
  id: string;
  number: string;
  creditMemoDate?: string;
  /** Sales credit memos. */
  externalDocumentNumber?: string;
  customerId?: string;
  customerName?: string;
  /** Purchase credit memos. */
  vendorCreditMemoNumber?: string;
  vendorId?: string;
  vendorName?: string;
  currencyCode?: string;
  status: string;
  totalAmountExcludingTax?: number;
  totalTaxAmount?: number;
  totalAmountIncludingTax?: number;
  salesCreditMemoLines?: BcDocumentLine[];
  purchaseCreditMemoLines?: BcDocumentLine[];
}

const STATUS: Record<string, InvoiceStatus> = {
  Draft: 'draft',
  'In Review': 'submitted',
  Open: 'authorised',
  Paid: 'paid',
  Canceled: 'voided',
  // A corrective credit memo is the posted memo that cancelled an invoice: closed, not void.
  Corrective: 'paid',
};

const STATUS_FILTER: Record<string, string> = {
  draft: "status eq 'Draft'",
  submitted: "status eq 'In Review'",
  authorised: "status eq 'Open'",
  paid: "(status eq 'Paid' or status eq 'Corrective')",
  voided: "status eq 'Canceled'",
};

const ENTITY: Record<CreditNoteType, string> = {
  sales: 'salesCreditMemos',
  purchase: 'purchaseCreditMemos',
};
const LINES: Record<CreditNoteType, string> = {
  sales: 'salesCreditMemoLines',
  purchase: 'purchaseCreditMemoLines',
};

export function fromBcCreditMemo(raw: BcCreditMemo, type: CreditNoteType, lcy: string): CreditNote {
  const status = STATUS[raw.status] ?? 'draft';
  const total = raw.totalAmountIncludingTax ?? 0;
  const isSales = type === 'sales';
  return {
    id: raw.id,
    type,
    number: raw.number,
    reference: (isSales ? raw.externalDocumentNumber : raw.vendorCreditMemoNumber) || undefined,
    contact: isSales
      ? { id: `c:${raw.customerId}`, name: raw.customerName ?? '' }
      : { id: `v:${raw.vendorId}`, name: raw.vendorName ?? '' },
    date: bcDate(raw.creditMemoDate) ?? '',
    status,
    currency: raw.currencyCode || lcy,
    subTotal: raw.totalAmountExcludingTax ?? 0,
    totalTax: raw.totalTaxAmount ?? 0,
    total,
    // API v2.0 has no remaining amount on credit memos. Unposted memos haven't been
    // applied (all of it remains); Paid/Canceled have nothing left. An Open memo may be
    // partly applied, so its remaining credit is unknown rather than assumed to be the total.
    remainingCredit:
      status === 'draft' || status === 'submitted'
        ? total
        : status === 'paid' || status === 'voided'
          ? 0
          : undefined,
    lineItems: (isSales ? raw.salesCreditMemoLines : raw.purchaseCreditMemoLines)?.map(
      fromBcDocumentLine
    ),
  };
}

export function bcCreditNotes(
  client: BcClient,
  lcy: () => Promise<string>
): CreditNotesModule | undefined {
  return {
    async list(type, query) {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const filters: string[] = [];
      if (!query?.status || query.status === 'all') filters.push("status ne 'Canceled'");
      else if (STATUS_FILTER[query.status]) filters.push(STATUS_FILTER[query.status]);
      if (query?.from) filters.push(`creditMemoDate ge ${query.from}`);
      if (query?.to) filters.push(`creditMemoDate le ${query.to}`);
      if (query?.contactId) {
        filters.push(
          `${type === 'sales' ? 'customerId' : 'vendorId'} eq ${parseContactId(query.contactId).id}`
        );
      }
      if (query?.search) {
        const s = odataString(query.search);
        filters.push(
          type === 'sales'
            ? `(contains(number,${s}) or contains(customerName,${s}) or contains(externalDocumentNumber,${s}))`
            : `(contains(number,${s}) or contains(vendorName,${s}) or contains(vendorCreditMemoNumber,${s}))`
        );
      }
      const result = await client.request<ODataList<BcCreditMemo>>(ENTITY[type], {
        query: {
          $filter: filters.join(' and ') || undefined,
          $orderby: 'creditMemoDate desc,number desc',
          $top: pageSize + 1,
          $skip: (page - 1) * pageSize,
        },
      });
      const currency = await lcy();
      const items = result.value.slice(0, pageSize).map((c) => fromBcCreditMemo(c, type, currency));
      return {
        items,
        page,
        pageSize,
        hasMore: result.value.length > pageSize,
        note: items.some((c) => c.remainingCredit === undefined)
          ? BC_CREDIT_REMAINING_NOTE
          : undefined,
      };
    },
    /** Sales and purchase credit memo ids are distinct GUIDs: try sales first. */
    async get(id) {
      for (const type of ['sales', 'purchase'] as const) {
        try {
          const raw = await client.request<BcCreditMemo>(`${ENTITY[type]}(${id})`, {
            query: { $expand: LINES[type] },
          });
          return fromBcCreditMemo(raw, type, await lcy());
        } catch (error) {
          if (!(error instanceof ConnectorError) || error.status !== 404) throw error;
        }
      }
      throw new ConnectorError('Credit note not found.', 404, 'business-central');
    },
  };
}
