import type { InvoiceType, Payment } from '@/lib/domain/types';
import type { PaymentsModule } from '../../types';
import type { BcClient } from '../client';
import { bcDate, parseContactId } from '../index';
import { extensionPayments, extensionRegisterPayment, type BookieExtension } from '../extension';

const DEFAULT_PAGE_SIZE = 50;

export interface BcJournalPayment {
  id: string;
  journalDisplayName?: string;
  customerId?: string;
  customerNumber?: string;
  vendorId?: string;
  vendorNumber?: string;
  postingDate?: string;
  documentNumber?: string;
  externalDocumentNumber?: string;
  amount?: number;
  appliesToInvoiceId?: string;
  appliesToInvoiceNumber?: string;
  description?: string;
}

export function fromBcJournalPayment(raw: BcJournalPayment, type: InvoiceType): Payment {
  const partyId = type === 'sales' ? raw.customerId : raw.vendorId;
  return {
    id: raw.id,
    date: bcDate(raw.postingDate) ?? '',
    // Payment journals sign receipts negative (a credit to the customer); show the size.
    amount: Math.abs(raw.amount ?? 0),
    // The journal line's currency code isn't in API v2.0 (a line can be in a foreign
    // currency), so the currency is left unset rather than assumed to be LCY.
    currency: undefined,
    reference: raw.externalDocumentNumber || raw.documentNumber || undefined,
    invoiceId:
      raw.appliesToInvoiceId && !/^0{8}-/.test(raw.appliesToInvoiceId)
        ? raw.appliesToInvoiceId
        : undefined,
    invoiceNumber: raw.appliesToInvoiceNumber || undefined,
    invoiceType: type,
    contact:
      partyId && !/^0{8}-/.test(partyId)
        ? {
            id: `${type === 'sales' ? 'c' : 'v'}:${partyId}`,
            // Journal lines carry the party's number, not its name.
            name: (type === 'sales' ? raw.customerNumber : raw.vendorNumber) || '',
          }
        : undefined,
    bankAccountName: raw.journalDisplayName || undefined,
    status: 'authorised',
  };
}

/**
 * Business Central payments as API v2.0 exposes them: the lines in the
 * customer and vendor payment journals (`customerPayments`, `vendorPayments`).
 * Posted customer/vendor ledger entries are not in the standard API.
 *
 * Without the Bookie BC extension, `create` is deliberately absent: payment
 * journals in API v2.0 can only balance against a G/L account (not the bank
 * account the user picks), and posting a journal posts every line in its batch,
 * including other people's. Record payments in Business Central itself.
 *
 * With the extension (bc-extension/), `list` returns posted payments applied to
 * invoices and bills, and `create` registers a customer payment against one
 * invoice in one BC transaction (customer payments only).
 *
 * `batches`/`createBatch` are absent: BC has no batch payment entity in API
 * v2.0, only vendor payment journals, and paying several bills means posting
 * a journal batch.
 */
export function bcPayments(
  client: BcClient,
  lcy: () => Promise<string>,
  extension?: BookieExtension
): PaymentsModule | undefined {
  const mod: PaymentsModule = {
    async list(query) {
      // Bookie BC extension: posted payments rather than unposted journal lines.
      const posted = await extensionPayments(client, query, lcy);
      if (posted) return posted;
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const types: InvoiceType[] = query?.invoiceType ? [query.invoiceType] : ['sales', 'purchase'];
      const contact = query?.contactId ? parseContactId(query.contactId) : undefined;
      const lists = await Promise.all(
        types.map(async (type) => {
          const filters: string[] = [];
          if (query?.from) filters.push(`postingDate ge ${query.from}`);
          if (query?.to) filters.push(`postingDate le ${query.to}`);
          if (contact) {
            if ((contact.entity === 'customers') !== (type === 'sales')) return [];
            filters.push(`${type === 'sales' ? 'customerId' : 'vendorId'} eq ${contact.id}`);
          }
          const rows = await client.all<BcJournalPayment>(
            type === 'sales' ? 'customerPayments' : 'vendorPayments',
            { $filter: filters.join(' and ') || undefined },
            2
          );
          return rows.map((r) => fromBcJournalPayment(r, type));
        })
      );
      const all = lists.flat().sort((a, b) => b.date.localeCompare(a.date));
      return {
        items: all.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        hasMore: all.length > page * pageSize,
        total: all.length,
      };
    },
  };
  // Bookie BC extension: register customer payments (bills stay in Business Central).
  if (extension) {
    mod.create = (input) => extensionRegisterPayment(client, input, lcy);
    mod.createFor = ['sales'];
  }
  return mod;
}
