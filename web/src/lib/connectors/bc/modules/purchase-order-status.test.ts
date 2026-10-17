import { describe, expect, it } from 'vitest';
import type { BcClient } from '../client';
import { bcPurchaseOrders, type BcPurchaseOrder } from './purchase-orders';

/* Shaped like GET purchaseOrders(id)?$expand=purchaseOrderLines; fictional values. */
const order = (status: string): BcPurchaseOrder => ({
  id: '5e5e5e5e-0000-4000-8000-000000000001',
  number: '106001',
  orderDate: '2026-10-01',
  requestedReceiptDate: '0001-01-01',
  vendorId: '6f6f6f6f-0000-4000-8000-000000000001',
  vendorName: 'Fabrikam Supplies',
  currencyCode: '',
  status,
  fullyReceived: false,
  totalAmountExcludingTax: 100,
  totalTaxAmount: 20,
  totalAmountIncludingTax: 120,
  purchaseOrderLines: [],
});

function fake(status: string) {
  const calls: { path: string; method?: string }[] = [];
  const client = {
    async request(path: string, init?: { method?: string }) {
      calls.push({ path, method: init?.method });
      if (init?.method === 'DELETE') return undefined;
      return order(status);
    },
  } as unknown as BcClient;
  return { client, calls };
}

describe('bc purchase order status', () => {
  it('offers delete for drafts only (no submit/approve/bill API in v2.0)', () => {
    const mod = bcPurchaseOrders(fake('Draft').client, async () => 'GBP')!;
    expect(mod.statusChanges).toEqual(['deleted']);
    expect(mod.deletableStatuses).toEqual(['draft']);
  });

  it('deletes a draft', async () => {
    const { client, calls } = fake('Draft');
    const result = await bcPurchaseOrders(client, async () => 'GBP')!.setStatus!(
      order('Draft').id,
      'deleted'
    );
    expect(result).toMatchObject({ status: 'deleted', number: '106001', currency: 'GBP' });
    expect(calls.at(-1)).toEqual({
      path: `purchaseOrders(${order('Draft').id})`,
      method: 'DELETE',
    });
  });

  it('refuses released orders and other changes', async () => {
    const released = fake('Open');
    const mod = bcPurchaseOrders(released.client, async () => 'GBP')!;
    await expect(mod.setStatus!(order('Open').id, 'deleted')).rejects.toThrow(/draft/);
    await expect(mod.setStatus!(order('Open').id, 'billed')).rejects.toThrow(/draft/);
    expect(released.calls.some((c) => c.method === 'DELETE')).toBe(false);
  });
});
