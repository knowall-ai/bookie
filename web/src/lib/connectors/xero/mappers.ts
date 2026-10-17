import type {
  Address,
  Contact,
  ContactInput,
  Invoice,
  InvoiceInput,
  InvoiceStatus,
  LineAmountType,
  LineItem,
  LineItemInput,
} from '@/lib/domain/types';
import { xeroDate, xeroTimestamp } from './client';

/* Raw Xero shapes (only the fields Bookie reads). */

export interface XeroLineItem {
  LineItemID?: string;
  ItemCode?: string;
  Description?: string;
  Quantity?: number;
  UnitAmount?: number;
  DiscountRate?: number;
  AccountCode?: string;
  TaxType?: string;
  TaxAmount?: number;
  LineAmount?: number;
}

export interface XeroAddress {
  AddressType?: string;
  AddressLine1?: string;
  AddressLine2?: string;
  City?: string;
  Region?: string;
  PostalCode?: string;
  Country?: string;
}

export interface XeroContact {
  ContactID: string;
  Name: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
  Website?: string;
  AccountNumber?: string;
  TaxNumber?: string;
  ContactStatus?: 'ACTIVE' | 'ARCHIVED' | 'GDPRREQUEST';
  IsCustomer?: boolean;
  IsSupplier?: boolean;
  DefaultCurrency?: string;
  Addresses?: XeroAddress[];
  Phones?: {
    PhoneType?: string;
    PhoneNumber?: string;
    PhoneAreaCode?: string;
    PhoneCountryCode?: string;
  }[];
  Balances?: {
    AccountsReceivable?: { Outstanding?: number; Overdue?: number };
    AccountsPayable?: { Outstanding?: number; Overdue?: number };
  };
  UpdatedDateUTC?: string;
}

export interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber?: string;
  Reference?: string;
  Type: 'ACCREC' | 'ACCPAY';
  Contact: { ContactID: string; Name: string };
  Date?: string;
  DateString?: string;
  DueDate?: string;
  DueDateString?: string;
  Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED' | 'DELETED';
  LineAmountTypes?: 'Exclusive' | 'Inclusive' | 'NoTax';
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  AmountDue?: number;
  AmountPaid?: number;
  AmountCredited?: number;
  CurrencyCode?: string;
  /** Units of `CurrencyCode` per one base-currency unit (1 for base-currency documents). */
  CurrencyRate?: number;
  LineItems?: XeroLineItem[];
  Payments?: { PaymentID: string; Date?: string; Amount?: number; Reference?: string }[];
  SentToContact?: boolean;
  UpdatedDateUTC?: string;
}

/* Status and type mapping */

const INVOICE_STATUS: Record<XeroInvoice['Status'], InvoiceStatus> = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  AUTHORISED: 'authorised',
  PAID: 'paid',
  VOIDED: 'voided',
  DELETED: 'deleted',
};

export const XERO_INVOICE_STATUS: Record<InvoiceStatus, XeroInvoice['Status']> = {
  draft: 'DRAFT',
  submitted: 'SUBMITTED',
  authorised: 'AUTHORISED',
  paid: 'PAID',
  voided: 'VOIDED',
  deleted: 'DELETED',
};

export function fromLineAmountTypes(value?: string): LineAmountType | undefined {
  if (value === 'Exclusive') return 'exclusive';
  if (value === 'Inclusive') return 'inclusive';
  if (value === 'NoTax') return 'none';
  return undefined;
}

export function toLineAmountTypes(value?: LineAmountType): XeroInvoice['LineAmountTypes'] {
  if (value === 'inclusive') return 'Inclusive';
  if (value === 'none') return 'NoTax';
  return 'Exclusive';
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Xero's CurrencyRate, kept only when it is a usable positive number. */
export function xeroRate(rate: number | undefined): number | undefined {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

/* Mappers */

export function fromXeroLineItem(line: XeroLineItem): LineItem {
  return {
    id: line.LineItemID,
    itemCode: line.ItemCode || undefined,
    description: line.Description ?? '',
    quantity: line.Quantity ?? 0,
    unitAmount: line.UnitAmount ?? 0,
    discountRate: line.DiscountRate || undefined,
    accountCode: line.AccountCode || undefined,
    taxType: line.TaxType || undefined,
    taxAmount: line.TaxAmount,
    lineAmount: line.LineAmount ?? 0,
  };
}

export function toXeroLineItem(line: LineItemInput): XeroLineItem {
  return {
    ItemCode: line.itemCode || undefined,
    Description: line.description,
    Quantity: line.quantity,
    UnitAmount: line.unitAmount,
    DiscountRate: line.discountRate || undefined,
    AccountCode: line.accountCode || undefined,
    TaxType: line.taxType || undefined,
  };
}

export function fromXeroInvoice(invoice: XeroInvoice): Invoice {
  const status = INVOICE_STATUS[invoice.Status];
  const dueDate = xeroDate(invoice.DueDateString ?? invoice.DueDate);
  return {
    id: invoice.InvoiceID,
    type: invoice.Type === 'ACCREC' ? 'sales' : 'purchase',
    number: invoice.InvoiceNumber || '',
    reference: invoice.Reference || undefined,
    contact: { id: invoice.Contact.ContactID, name: invoice.Contact.Name },
    date: xeroDate(invoice.DateString ?? invoice.Date) ?? '',
    dueDate,
    status,
    currency: invoice.CurrencyCode ?? '',
    currencyRate: xeroRate(invoice.CurrencyRate),
    lineAmountType: fromLineAmountTypes(invoice.LineAmountTypes),
    subTotal: invoice.SubTotal ?? 0,
    totalTax: invoice.TotalTax ?? 0,
    total: invoice.Total ?? 0,
    amountDue: invoice.AmountDue ?? 0,
    amountPaid: invoice.AmountPaid ?? 0,
    amountCredited: invoice.AmountCredited || undefined,
    isOverdue:
      status === 'authorised' && !!dueDate && dueDate < today() && (invoice.AmountDue ?? 0) > 0,
    lineItems: invoice.LineItems?.map(fromXeroLineItem),
    payments: invoice.Payments?.map((p) => ({
      id: p.PaymentID,
      date: xeroDate(p.Date) ?? '',
      amount: p.Amount ?? 0,
      reference: p.Reference || undefined,
    })),
    sentToContact: invoice.SentToContact,
    updatedAt: xeroTimestamp(invoice.UpdatedDateUTC),
  };
}

export function toXeroInvoice(
  input: InvoiceInput,
  id?: string
): Partial<XeroInvoice> & Record<string, unknown> {
  return {
    ...(id ? { InvoiceID: id } : {}),
    Type: input.type === 'sales' ? 'ACCREC' : 'ACCPAY',
    Contact: { ContactID: input.contactId, Name: '' } as XeroInvoice['Contact'],
    Date: input.date,
    DueDate: input.dueDate,
    InvoiceNumber: input.number || undefined,
    Reference: input.reference || undefined,
    CurrencyCode: input.currency || undefined,
    CurrencyRate: input.currency ? xeroRate(input.currencyRate) : undefined,
    LineAmountTypes: toLineAmountTypes(input.lineAmountType),
    Status: XERO_INVOICE_STATUS[input.status ?? 'draft'],
    LineItems: input.lineItems.map(toXeroLineItem),
  };
}

function fromXeroAddress(addresses?: XeroAddress[]): Address | undefined {
  const a =
    addresses?.find((x) => x.AddressType === 'POBOX' && x.AddressLine1) ??
    addresses?.find((x) => x.AddressLine1 || x.City);
  if (!a) return undefined;
  return {
    line1: a.AddressLine1 || undefined,
    line2: a.AddressLine2 || undefined,
    city: a.City || undefined,
    region: a.Region || undefined,
    postalCode: a.PostalCode || undefined,
    country: a.Country || undefined,
  };
}

/** Xero's "Phone" is the DEFAULT phone; fall back to mobile, then direct dial. */
const PHONE_PREFERENCE = ['DEFAULT', 'MOBILE', 'DDI'];

/**
 * Xero contacts. `Balances` is only returned with `summaryOnly=false` (lists)
 * or on a single GET, and Xero omits it entirely when both balances are zero,
 * so pass `zeroWhenMissing` when the response is known to be a full one.
 */
export function fromXeroContact(contact: XeroContact, zeroWhenMissing = false): Contact {
  const phone = [...(contact.Phones ?? [])]
    .filter((p) => p.PhoneNumber)
    .sort(
      (a, b) =>
        rank(PHONE_PREFERENCE, a.PhoneType ?? '') - rank(PHONE_PREFERENCE, b.PhoneType ?? '')
    )[0];
  const ar = contact.Balances?.AccountsReceivable;
  const ap = contact.Balances?.AccountsPayable;
  const hasBalances = !!(ar || ap) || zeroWhenMissing;
  return {
    id: contact.ContactID,
    name: contact.Name,
    firstName: contact.FirstName || undefined,
    lastName: contact.LastName || undefined,
    email: contact.EmailAddress || undefined,
    phone: phone
      ? [phone.PhoneCountryCode, phone.PhoneAreaCode, phone.PhoneNumber].filter(Boolean).join(' ')
      : undefined,
    website: contact.Website || undefined,
    accountNumber: contact.AccountNumber || undefined,
    taxNumber: contact.TaxNumber || undefined,
    address: fromXeroAddress(contact.Addresses),
    isCustomer: !!contact.IsCustomer,
    isSupplier: !!contact.IsSupplier,
    status: contact.ContactStatus === 'ARCHIVED' ? 'archived' : 'active',
    currency: contact.DefaultCurrency || undefined,
    balances: hasBalances
      ? {
          receivable: ar?.Outstanding ?? 0,
          payable: ap?.Outstanding ?? 0,
          overdueReceivable: ar?.Overdue ?? 0,
          overduePayable: ap?.Overdue ?? 0,
        }
      : undefined,
    updatedAt: xeroTimestamp(contact.UpdatedDateUTC),
  };
}

function rank(order: string[], value: string) {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

export function toXeroContact(input: ContactInput, id?: string): Record<string, unknown> {
  return {
    ...(id ? { ContactID: id } : {}),
    Name: input.name,
    FirstName: input.firstName,
    LastName: input.lastName,
    EmailAddress: input.email,
    Website: input.website,
    AccountNumber: input.accountNumber,
    TaxNumber: input.taxNumber,
    // The whole number goes in PhoneNumber, so clear any old area/country code.
    Phones:
      input.phone !== undefined
        ? [
            {
              PhoneType: 'DEFAULT',
              PhoneNumber: input.phone,
              PhoneAreaCode: '',
              PhoneCountryCode: '',
            },
          ]
        : undefined,
    Addresses: input.address
      ? [
          {
            AddressType: 'POBOX',
            AddressLine1: input.address.line1,
            AddressLine2: input.address.line2,
            City: input.address.city,
            Region: input.address.region,
            PostalCode: input.address.postalCode,
            Country: input.address.country,
          },
        ]
      : undefined,
  };
}
