import { afterEach, describe, expect, it } from 'vitest';
import { createDemoConnector, DEMO_ORGS } from '../index';
import { demoSourceKey, recent, resetLiveEvents } from '@/lib/webhooks/events';
import { purchaseOrderStatusChanges } from '@/lib/domain/purchase-orders';

const org = DEMO_ORGS[1];
const connector = () => createDemoConnector(org);

afterEach(() => resetLiveEvents());

describe('demo bank transfers', () => {
  it('starts with the seeded transfer from the register', async () => {
    const page = await connector().bank!.transfers!();
    expect(page.items[0]).toMatchObject({
      from: { id: 'acc-090' },
      to: { id: 'acc-091' },
      amount: 5000,
      currency: 'GBP',
    });
  });

  it('moves both balances, adds two register lines and keeps the ledger balanced', async () => {
    const c = connector();
    const before = await c.bank!.accounts();
    const balance = (id: string, list = before) => list.find((a) => a.id === id)!.balance!;
    const created = await c.bank!.createTransfer!({
      fromBankAccountId: 'acc-090',
      toBankAccountId: 'acc-091',
      date: '2026-10-10',
      amount: 321.45,
      reference: 'Test sweep',
    });
    const after = await c.bank!.accounts();
    expect(balance('acc-090', after)).toBeCloseTo(balance('acc-090') - 321.45, 2);
    expect(balance('acc-091', after)).toBeCloseTo(balance('acc-091') + 321.45, 2);
    expect((await c.bank!.transfers!()).items.some((t) => t.id === created.id)).toBe(true);
    const savings = await c.bank!.transactions('acc-091', { search: 'Test sweep' });
    expect(savings.items[0]).toMatchObject({ type: 'transfer-in', amount: 321.45 });
    const ledger = await c.accounts!.ledger!({ pageSize: 100_000 });
    expect(Math.abs(ledger.items.reduce((s, e) => s + e.debit - e.credit, 0))).toBeLessThan(0.01);
  });

  it('refuses a transfer to the same account', async () => {
    await expect(
      connector().bank!.createTransfer!({
        fromBankAccountId: 'acc-090',
        toBankAccountId: 'acc-090',
        date: '2026-10-10',
        amount: 1,
      })
    ).rejects.toThrow(/different/);
  });
});

describe('demo batch payments', () => {
  it('pays several approved bills at once and publishes a live event per bill', async () => {
    const c = connector();
    const bills = (await c.invoices!.list('purchase', { status: 'authorised' })).items.slice(0, 2);
    expect(bills).toHaveLength(2);
    const batch = await c.payments!.createBatch!({
      bankAccountId: 'acc-090',
      date: '2026-10-11',
      reference: 'OCT',
      payments: bills.map((b) => ({ invoiceId: b.id, amount: b.amountDue! })),
    });
    expect(batch.total).toBeCloseTo(
      bills.reduce((s, b) => s + b.amountDue!, 0),
      2
    );
    expect(batch.payments).toHaveLength(2);
    for (const bill of bills) expect((await c.invoices!.get(bill.id)).status).toBe('paid');
    expect((await c.payments!.batches!()).items[0].id).toBe(batch.id);
    const events = recent(demoSourceKey(org.key));
    expect(events.map((e) => e.id).sort()).toEqual(bills.map((b) => b.id).sort());
  });

  it('is all-or-nothing when one bill is over-paid', async () => {
    // The other demo org: the test above paid this one's approved bills.
    const c = createDemoConnector(DEMO_ORGS[0]);
    const bills = (await c.invoices!.list('purchase', { status: 'authorised' })).items.slice(0, 2);
    await expect(
      c.payments!.createBatch!({
        bankAccountId: 'acc-090',
        date: '2026-10-11',
        payments: [
          { invoiceId: bills[0].id, amount: bills[0].amountDue! },
          { invoiceId: bills[1].id, amount: bills[1].amountDue! + 100 },
        ],
      })
    ).rejects.toThrow(/amount due/);
    expect((await c.invoices!.get(bills[0].id)).status).toBe('authorised');
  });
});

describe('purchase order status changes', () => {
  it('follows Xero: draft → awaiting approval → approved → billed; delete until billed', () => {
    const all = ['submitted', 'authorised', 'billed', 'deleted'] as const;
    expect(purchaseOrderStatusChanges('draft', all)).toEqual([
      'submitted',
      'authorised',
      'deleted',
    ]);
    expect(purchaseOrderStatusChanges('submitted', all)).toEqual(['authorised', 'deleted']);
    expect(purchaseOrderStatusChanges('authorised', all)).toEqual(['billed', 'deleted']);
    expect(purchaseOrderStatusChanges('billed', all)).toEqual([]);
    // Business Central: delete drafts only.
    expect(purchaseOrderStatusChanges('draft', ['deleted'], ['draft'])).toEqual(['deleted']);
    expect(purchaseOrderStatusChanges('authorised', ['deleted'], ['draft'])).toEqual([]);
  });

  it('moves a demo order through its statuses and rejects skipping back', async () => {
    const c = connector();
    const mod = c.purchaseOrders!;
    const draft = (await mod.list({ status: 'draft' })).items[0];
    expect((await mod.setStatus!(draft.id, 'submitted')).status).toBe('submitted');
    expect((await mod.setStatus!(draft.id, 'authorised')).status).toBe('authorised');
    await expect(mod.setStatus!(draft.id, 'submitted')).rejects.toThrow(/not possible/);
    expect((await mod.setStatus!(draft.id, 'billed')).status).toBe('billed');
  });
});
