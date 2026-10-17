import type {
  CreditNote,
  CreditNoteInput,
  CreditNoteType,
  InvoiceStatus,
} from '@/lib/domain/types';
import type { CreditNotesModule } from '../../types';
import { ConnectorError } from '../../types';
import { odataString, type BcClient, type ODataList } from '../client';
import { bcDate, parseContactId } from '../index';
import { fromBcDocumentLine, toBcDocumentLine, type BcDocumentLine } from './document-lines';

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
  pricesIncludeTax?: boolean;
  status: string;
  totalAmountExcludingTax?: number;
  totalTaxAmount?: number;
  totalAmountIncludingTax?: number;
  /** The posted invoice this memo applies to ("Applies-to Doc. No."), when set. */
  invoiceId?: string;
  invoiceNumber?: string;
  lastModifiedDateTime?: string;
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

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

/** Shown on approved BC credit memos: API v2.0 has no apply-entries endpoint. */
export const BC_ALLOCATION_NOTE =
  "Business Central's API can't apply a posted credit memo to an invoice. Apply it in Business Central (Customer or Vendor Ledger Entries › Apply Entries).";

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
    lineAmountType:
      raw.pricesIncludeTax === undefined
        ? undefined
        : raw.pricesIncludeTax
          ? 'inclusive'
          : 'exclusive',
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
    appliesTo: raw.invoiceNumber
      ? {
          id: raw.invoiceId && raw.invoiceId !== EMPTY_GUID ? raw.invoiceId : undefined,
          number: raw.invoiceNumber,
        }
      : undefined,
    updatedAt: raw.lastModifiedDateTime,
  };
}

/** Header body for POST/PATCH salesCreditMemos or purchaseCreditMemos. */
export function toBcCreditMemo(input: CreditNoteInput) {
  const { entity, id } = parseContactId(input.contactId);
  if (input.type === 'sales') {
    if (entity !== 'customers')
      throw new ConnectorError('Choose a customer.', 400, 'business-central');
    return {
      customerId: id,
      creditMemoDate: input.date,
      externalDocumentNumber: input.reference,
      currencyCode: input.currency,
    };
  }
  if (entity !== 'vendors') throw new ConnectorError('Choose a supplier.', 400, 'business-central');
  return {
    vendorId: id,
    creditMemoDate: input.date,
    // BC needs a vendor credit memo number to post; the reference is the supplier's number.
    vendorCreditMemoNumber: input.reference ?? input.number,
    currencyCode: input.currency,
  };
}

/** De-duplicate per-field search results and keep BC's order: newest first, then number. */
export function mergeCreditMemos(results: BcCreditMemo[][]): BcCreditMemo[] {
  const byId = new Map(results.flat().map((raw) => [raw.id, raw]));
  return [...byId.values()].sort(
    (a, b) =>
      (b.creditMemoDate ?? '').localeCompare(a.creditMemoDate ?? '') ||
      b.number.localeCompare(a.number)
  );
}

export function bcCreditNotes(
  client: BcClient,
  lcy: () => Promise<string>
): CreditNotesModule | undefined {
  const price = (type: CreditNoteType) => (type === 'sales' ? 'unitPrice' : 'unitCost');

  /** Sales and purchase credit memo ids are distinct GUIDs: try sales first. */
  const locate = async (id: string) => {
    for (const type of ['sales', 'purchase'] as const) {
      try {
        const raw = await client.request<BcCreditMemo>(`${ENTITY[type]}(${id})`, {
          query: { $expand: LINES[type] },
        });
        return { type, raw };
      } catch (error) {
        if (!(error instanceof ConnectorError) || error.status !== 404) throw error;
      }
    }
    throw new ConnectorError('Credit note not found.', 404, 'business-central');
  };

  const writeLines = async (type: CreditNoteType, id: string, input: CreditNoteInput) => {
    for (const line of input.lineItems) {
      await client.request(`${ENTITY[type]}(${id})/${LINES[type]}`, {
        method: 'POST',
        body: toBcDocumentLine(line, price(type)),
      });
    }
  };

  const action = async (id: string, name: 'post' | 'cancel') => {
    const { type } = await locate(id);
    await client.request(`${ENTITY[type]}(${id})/Microsoft.NAV.${name}`, { method: 'POST' });
    return mod.get(id);
  };

  const mod: CreditNotesModule = {
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
      const orderby = 'creditMemoDate desc,number desc';
      if (query?.search) {
        // BC rejects `or` across different fields ("The 'OR' operator is not supported on
        // distinct fields"), so search each field separately and merge, as invoices do.
        const s = odataString(query.search);
        const fields =
          type === 'sales'
            ? ['number', 'customerName', 'externalDocumentNumber']
            : ['number', 'vendorName', 'vendorCreditMemoNumber'];
        const results = await Promise.all(
          fields.map((field) =>
            client.all<BcCreditMemo>(
              ENTITY[type],
              {
                $filter: [...filters, `contains(${field},${s})`].join(' and '),
                $orderby: orderby,
                $top: 500,
              },
              1
            )
          )
        );
        const merged = mergeCreditMemos(results);
        const currency = await lcy();
        return {
          items: merged
            .slice((page - 1) * pageSize, page * pageSize)
            .map((c) => fromBcCreditMemo(c, type, currency)),
          page,
          pageSize,
          hasMore: merged.length > page * pageSize,
          total: merged.length,
        };
      }
      const result = await client.request<ODataList<BcCreditMemo>>(ENTITY[type], {
        query: {
          $filter: filters.join(' and ') || undefined,
          $orderby: orderby,
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
    async get(id) {
      const { type, raw } = await locate(id);
      return fromBcCreditMemo(raw, type, await lcy());
    },
    async create(input) {
      const created = await client.request<{ id: string }>(ENTITY[input.type], {
        method: 'POST',
        body: toBcCreditMemo(input),
      });
      await writeLines(input.type, created.id, input);
      if (input.status === 'authorised') return action(created.id, 'post');
      return mod.get(created.id);
    },
    async update(id, input) {
      const { type, raw } = await locate(id);
      if (raw.status !== 'Draft') {
        throw new ConnectorError(
          'Only draft credit memos can be edited in Business Central.',
          409,
          'business-central'
        );
      }
      await client.request(`${ENTITY[type]}(${id})`, {
        method: 'PATCH',
        etag: '*',
        body: toBcCreditMemo({ ...input, type }),
      });
      const lines =
        (type === 'sales' ? raw.salesCreditMemoLines : raw.purchaseCreditMemoLines) ?? [];
      for (const line of lines) {
        await client.request(`${ENTITY[type]}(${id})/${LINES[type]}(${line.id})`, {
          method: 'DELETE',
          etag: '*',
        });
      }
      await writeLines(type, id, input);
      if (input.status === 'authorised') return action(id, 'post');
      return mod.get(id);
    },
    approve: (id) => action(id, 'post'),
    void: (id) => action(id, 'cancel'),
    async delete(id) {
      const { type, raw } = await locate(id);
      if (raw.status !== 'Draft') {
        throw new ConnectorError(
          'Only draft credit memos can be deleted.',
          409,
          'business-central'
        );
      }
      await client.request(`${ENTITY[type]}(${id})`, { method: 'DELETE', etag: '*' });
    },
    // No `allocate`: API v2.0 has no apply-entries endpoint for credit memos.
    allocationNote: BC_ALLOCATION_NOTE,
  };
  return mod;
}
