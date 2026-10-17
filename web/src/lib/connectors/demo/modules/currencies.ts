import type { Contact, Currency, Invoice, LineItem } from '@/lib/domain/types';
import type { CurrenciesModule } from '../../types';
import { isForeign } from '@/lib/domain/currency';
import { addDays, DEMO_TODAY, type DemoData } from '../data';

/** The demo org has multi-currency on, like a Xero UK org trading into Europe and the US. */
export const DEMO_CURRENCIES: Currency[] = [
  { code: 'GBP', name: 'British Pound' },
  { code: 'EUR', name: 'Euro' },
  { code: 'USD', name: 'United States Dollar' },
];

/** A fictional euro customer and their invoices (fixtures for tests and screenshots only). */
export const DEMO_EUR_CUSTOMER: Contact = {
  id: 'cust-eur-1',
  name: 'Fabrikam Hôtels Paris SARL',
  email: 'comptabilite@fabrikam-paris.example.com',
  isCustomer: true,
  isSupplier: false,
  status: 'active',
  currency: 'EUR',
  accountNumber: 'CUS-EUR-01',
  address: { line1: '12 Rue de l’Exemple', city: 'Paris', postalCode: '75001', country: 'France' },
};

function eurLines(lines: [string, string, number, number][]): LineItem[] {
  return lines.map(([itemCode, description, quantity, unitAmount]) => ({
    itemCode,
    description,
    quantity,
    unitAmount,
    accountCode: '200',
    // Goods exported to the EU are zero-rated for UK VAT.
    taxType: 'ZERORATEDOUTPUT',
    taxAmount: 0,
    lineAmount: Math.round(quantity * unitAmount * 100) / 100,
  }));
}

function eurInvoice(
  n: number,
  daysAgo: number,
  status: 'draft' | 'authorised' | 'paid',
  currencyRate: number,
  lines: [string, string, number, number][]
): Invoice {
  const today = DEMO_TODAY();
  const date = addDays(today, -daysAgo);
  const dueDate = addDays(date, 30);
  const lineItems = eurLines(lines);
  const total = lineItems.reduce((s, l) => s + l.lineAmount, 0);
  const amountDue = status === 'paid' ? 0 : total;
  return {
    id: `inv-eur-${n}`,
    type: 'sales',
    number: `INV-${1089 + n}`,
    reference: `BC-PARIS-${200 + n}`,
    contact: { id: DEMO_EUR_CUSTOMER.id, name: DEMO_EUR_CUSTOMER.name },
    date,
    dueDate,
    status,
    currency: 'EUR',
    currencyRate,
    lineAmountType: 'exclusive',
    subTotal: total,
    totalTax: 0,
    total,
    amountDue,
    amountPaid: total - amountDue,
    isOverdue: status === 'authorised' && dueDate < today,
    lineItems,
    payments:
      status === 'paid' ? [{ id: `pay-eur-${n}`, date: addDays(date, 21), amount: total }] : [],
  };
}

const seeded = new WeakSet<DemoData>();

/** Add the euro customer and invoices to a demo data set, once. */
export function seedForeignCurrency(data: DemoData) {
  if (seeded.has(data) || data.contacts.some((c) => c.id === DEMO_EUR_CUSTOMER.id)) return;
  seeded.add(data);
  data.contacts.push(structuredClone(DEMO_EUR_CUSTOMER));
  data.invoices.push(
    eurInvoice(1, 120, 'paid', 1.1712, [['ESP-1KG', 'Espresso blend 1kg', 60, 27.5]]),
    eurInvoice(2, 45, 'authorised', 1.1648, [
      ['ESP-1KG', 'Espresso blend 1kg', 40, 27.5],
      ['FIL-1KG', 'Filter roast 1kg', 30, 25],
    ]),
    eurInvoice(3, 3, 'draft', 1.1585, [['FIL-1KG', 'Filter roast 1kg', 24, 25]])
  );
  data.invoices.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * A copy of `invoice` with its money in the base currency, at the invoice's
 * own rate, for the demo ledger and reports. `undefined` for a foreign
 * invoice with no rate (left out rather than mixed in).
 */
export function demoInBase(invoice: Invoice, baseCurrency = 'GBP'): Invoice | undefined {
  if (!isForeign(invoice.currency, baseCurrency)) return invoice;
  const rate = invoice.currencyRate;
  if (!rate || rate <= 0) return undefined;
  const conv = (n: number) => Math.round((n / rate) * 100) / 100;
  return {
    ...invoice,
    currency: baseCurrency,
    currencyRate: undefined,
    subTotal: conv(invoice.subTotal),
    totalTax: conv(invoice.totalTax),
    total: conv(invoice.total),
    amountDue: conv(invoice.amountDue),
    amountPaid: conv(invoice.amountPaid),
    amountCredited: invoice.amountCredited ? conv(invoice.amountCredited) : undefined,
    payments: invoice.payments?.map((p) => ({ ...p, amount: conv(p.amount) })),
    lineItems: invoice.lineItems?.map((l) => ({
      ...l,
      unitAmount: conv(l.unitAmount),
      lineAmount: conv(l.lineAmount),
      taxAmount: l.taxAmount === undefined ? undefined : conv(l.taxAmount),
    })),
  };
}

export function demoCurrencies(data: DemoData): CurrenciesModule {
  seedForeignCurrency(data);
  return {
    acceptsRate: true,
    async list() {
      return structuredClone(DEMO_CURRENCIES);
    },
  };
}
