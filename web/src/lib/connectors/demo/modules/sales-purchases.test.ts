import { describe, expect, it } from 'vitest';
import { demoData } from '../data';
import { demoQuotes } from './quotes';
import { demoCreditNotes } from './credit-notes';
import { demoPurchaseOrders } from './purchase-orders';
import { demoItems } from './items';
import { demoPayments } from './payments';

describe('demo sales and purchases', () => {
  it('lists quotes by status and converts an accepted one to an invoice', async () => {
    const data = demoData('test-quotes');
    const quotes = demoQuotes(data)!;
    const accepted = await quotes.list({ status: 'accepted' });
    expect(accepted.items.length).toBeGreaterThan(0);
    expect(accepted.items.every((q) => q.status === 'accepted')).toBe(true);
    const before = data.invoices.length;
    const { invoiceId } = await quotes.convertToInvoice!(accepted.items[0].id);
    expect(data.invoices.length).toBe(before + 1);
    expect(data.invoices[0]).toMatchObject({ id: invoiceId, status: 'draft', type: 'sales' });
    expect((await quotes.get(accepted.items[0].id)).status).toBe('invoiced');
  });

  it('enforces quote status transitions', async () => {
    const quotes = demoQuotes(demoData('test-transitions'))!;
    const [draft] = (await quotes.list({ status: 'draft' })).items;
    await expect(quotes.setStatus!(draft.id, 'accepted')).rejects.toThrow(/can't be marked/);
    expect((await quotes.setStatus!(draft.id, 'sent')).status).toBe('sent');
    expect((await quotes.setStatus!(draft.id, 'accepted')).status).toBe('accepted');
  });

  it('creates a quote with VAT totals', async () => {
    const data = demoData('test-create');
    const quote = await demoQuotes(data)!.create!({
      contactId: data.contacts[0].id,
      date: '2026-01-01',
      lineItems: [{ description: 'Beans', quantity: 2, unitAmount: 10 }],
    });
    expect(quote).toMatchObject({ status: 'draft', subTotal: 20, totalTax: 4, total: 24 });
  });

  it('keeps sales and supplier credit notes apart', async () => {
    const notes = demoCreditNotes(demoData('test-credit'))!;
    const sales = await notes.list('sales');
    const purchase = await notes.list('purchase');
    expect(sales.items.every((n) => n.type === 'sales')).toBe(true);
    expect(purchase.items.every((n) => n.type === 'purchase')).toBe(true);
    expect(sales.items.some((n) => n.status === 'voided')).toBe(false);
  });

  it('creates purchase orders as drafts', async () => {
    const data = demoData('test-po');
    const supplier = data.contacts.find((c) => c.isSupplier)!;
    const order = await demoPurchaseOrders(data)!.create!({
      contactId: supplier.id,
      date: '2026-01-01',
      lineItems: [{ description: 'Green beans', quantity: 10, unitAmount: 5 }],
    });
    expect(order).toMatchObject({ status: 'draft', total: 60 });
  });

  it('rejects duplicate item codes', async () => {
    const items = demoItems(demoData('test-items'))!;
    await expect(items.create!({ code: 'esp-1kg', name: 'Dup' })).rejects.toThrow(/already exists/);
    const created = await items.create!({ code: 'NEW-1', name: 'New', salePrice: 3 });
    expect(created).toMatchObject({ isSold: true, isPurchased: false });
  });

  it('records a part payment, then the rest', async () => {
    const data = demoData('test-pay');
    const payments = demoPayments(data)!;
    const invoice = data.invoices.find((i) => i.type === 'sales' && i.status === 'authorised')!;
    const due = invoice.amountDue;
    await payments.create!({
      invoiceId: invoice.id,
      bankAccountId: 'acc-090',
      date: '2026-01-02',
      amount: 10,
    });
    expect(invoice.amountDue).toBeCloseTo(due - 10);
    await expect(
      payments.create!({
        invoiceId: invoice.id,
        bankAccountId: 'acc-090',
        date: '2026-01-02',
        amount: due,
      })
    ).rejects.toThrow(/no more than/);
    await payments.create!({
      invoiceId: invoice.id,
      bankAccountId: 'acc-090',
      date: '2026-01-03',
      amount: invoice.amountDue,
    });
    expect(invoice.status).toBe('paid');
    const listed = await payments.list({ invoiceType: 'sales' });
    expect(listed.items.filter((p) => p.invoiceId === invoice.id)).toHaveLength(2);
  });
});
