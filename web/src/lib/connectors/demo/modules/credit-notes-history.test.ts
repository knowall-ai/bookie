import { describe, expect, it } from 'vitest';
import { demoData } from '../data';
import { demoCreditNotes } from './credit-notes';
import { demoHistory } from './history';
import { demoInvoiceExtras } from './invoice-extras';
import { demoQuotes } from './quotes';

describe('demo credit notes: write and allocate', () => {
  it('creates a draft, approves it and allocates credit to an open invoice', async () => {
    const data = demoData('test-credit-write');
    const notes = demoCreditNotes(data)!;
    const invoice = data.invoices.find(
      (i) => i.type === 'sales' && i.status === 'authorised' && i.amountDue > 20
    )!;
    const draft = await notes.create!({
      type: 'sales',
      contactId: invoice.contact.id,
      date: '2026-05-01',
      reference: 'Short delivery',
      lineItems: [{ description: 'Espresso blend 1kg', quantity: 1, unitAmount: 10 }],
    });
    expect(draft).toMatchObject({ status: 'draft', total: 12, remainingCredit: 12 });
    await expect(
      notes.allocate!(draft.id, { invoiceId: invoice.id, amount: 5, date: '2026-05-02' })
    ).rejects.toThrow(/no credit left/);

    expect((await notes.approve!(draft.id)).status).toBe('authorised');
    const due = invoice.amountDue;
    await expect(
      notes.allocate!(draft.id, { invoiceId: invoice.id, amount: 13, date: '2026-05-02' })
    ).rejects.toThrow(/no more than/);

    const after = await notes.allocate!(draft.id, {
      invoiceId: invoice.id,
      amount: 5,
      date: '2026-05-02',
    });
    expect(after.remainingCredit).toBe(7);
    expect(after.allocations).toMatchObject([{ amount: 5, invoice: { id: invoice.id } }]);
    expect(invoice.amountDue).toBe(Math.round((due - 5) * 100) / 100);
    expect(invoice.amountCredited).toBeGreaterThanOrEqual(5);

    const full = await notes.allocate!(draft.id, {
      invoiceId: invoice.id,
      amount: 7,
      date: '2026-05-02',
    });
    expect(full).toMatchObject({ status: 'paid', remainingCredit: 0 });
    await expect(notes.void!(draft.id)).rejects.toThrow(/no allocations/);
  });

  it('refuses another contact’s invoice', async () => {
    const data = demoData('test-credit-contact');
    const notes = demoCreditNotes(data)!;
    const [note] = (await notes.list('sales', { status: 'authorised' })).items;
    const other = data.invoices.find(
      (i) => i.type === 'sales' && i.status === 'authorised' && i.contact.id !== note.contact.id
    )!;
    await expect(
      notes.allocate!(note.id, { invoiceId: other.id, amount: 1, date: '2026-05-02' })
    ).rejects.toThrow(/same contact/);
  });

  it('edits and deletes drafts only', async () => {
    const notes = demoCreditNotes(demoData('test-credit-edit'))!;
    const [draft] = (await notes.list('sales', { status: 'draft' })).items;
    const edited = await notes.update!(draft.id, {
      type: 'sales',
      contactId: draft.contact.id,
      date: draft.date,
      lineItems: [{ description: 'Grinder part', quantity: 2, unitAmount: 5 }],
    });
    expect(edited.total).toBe(12);
    await notes.delete!(draft.id);
    expect((await notes.list('sales', { status: 'draft' })).items.map((n) => n.id)).not.toContain(
      draft.id
    );
    const [approved] = (await notes.list('sales', { status: 'authorised' })).items;
    await expect(notes.delete!(approved.id)).rejects.toThrow(/draft/);
  });
});

describe('demo history and invoice extras', () => {
  it('seeds history, records quote changes and adds notes, newest first', async () => {
    const data = demoData('test-history');
    const history = demoHistory(data);
    const quotes = demoQuotes(data)!;
    const [draft] = (await quotes.list({ status: 'draft' })).items;
    expect((await history.list('quote', draft.id)).records.map((r) => r.change)).toEqual([
      'Created',
    ]);
    await quotes.setStatus!(draft.id, 'sent');
    await history.addNote!('quote', draft.id, 'Customer asked for a 10% volume discount.');
    const result = await history.list('quote', draft.id);
    expect(result.complete).toBe(true);
    expect(result.records.map((r) => r.change)).toEqual(['Note', 'Sent', 'Created']);
    expect(result.records[0]).toMatchObject({
      details: 'Customer asked for a 10% volume discount.',
    });
    await expect(history.addNote!('quote', 'nope', 'x')).rejects.toThrow(/Not found/);
  });

  it('marks an approved invoice as sent and gives an online link', async () => {
    const data = demoData('test-extras');
    const extras = demoInvoiceExtras(data);
    const invoice = data.invoices.find((i) => i.type === 'sales' && i.status === 'authorised')!;
    expect(await extras.onlineUrl!(invoice.id)).toMatch(/^https:\/\/invoices\.example\.com\//);
    expect((await extras.markAsSent!(invoice.id)).sentToContact).toBe(true);
    const draft = data.invoices.find((i) => i.type === 'sales' && i.status === 'draft')!;
    await expect(extras.markAsSent!(draft.id)).rejects.toThrow(/approved/);
    await expect(extras.onlineUrl!(draft.id)).rejects.toThrow(/approved/);
    expect((await extras.brandingThemes!()).length).toBeGreaterThan(1);
    const records = (await demoHistory(data).list('invoice', invoice.id)).records;
    expect(records[0].change).toBe('Marked as sent');
  });
});
