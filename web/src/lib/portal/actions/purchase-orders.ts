'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { PurchaseOrderInput, PurchaseOrderStatusChange } from '@/lib/domain/types';
import { purchaseOrderStatusChanges } from '@/lib/domain/purchase-orders';
import {
  describeError,
  isoDate,
  lineItemSchema,
  currencyRateSchema,
  type ActionResult,
} from './util';

const purchaseOrderSchema = z.object({
  contactId: z.string().min(1, 'Choose a supplier.'),
  date: isoDate,
  deliveryDate: isoDate.optional(),
  reference: z.string().trim().max(255).optional(),
  currency: z.string().length(3).optional(),
  currencyRate: currencyRateSchema,
  lineAmountType: z.enum(['exclusive', 'inclusive', 'none']).optional(),
  lineItems: z.array(lineItemSchema).min(1, 'Add at least one line.'),
});

export async function savePurchaseOrder(
  orgKey: string,
  id: string | undefined,
  input: PurchaseOrderInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = purchaseOrderSchema.parse(input) as PurchaseOrderInput;
    const { connector, base } = await orgContext(orgKey);
    const mod = connector.purchaseOrders;
    const save = id ? mod?.update?.bind(null, id) : mod?.create;
    if (!save) {
      return { ok: false, error: 'This organisation does not allow editing purchase orders here.' };
    }
    const order = await save(parsed);
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: order.id } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

const statusChangeSchema = z.enum(['submitted', 'authorised', 'billed', 'deleted']);

/** Submit for approval, approve, mark as billed or delete (live books; the UI confirms). */
export async function setPurchaseOrderStatus(
  orgKey: string,
  id: string,
  status: PurchaseOrderStatusChange
): Promise<ActionResult<{ id: string }>> {
  try {
    const change = statusChangeSchema.parse(status);
    const orderId = z.string().min(1).max(120).parse(id);
    const { connector, base } = await orgContext(orgKey);
    const mod = connector.purchaseOrders;
    if (!mod?.setStatus) {
      return {
        ok: false,
        error: 'This organisation does not allow changing purchase orders here.',
      };
    }
    // Re-read the order so only a move its current status allows goes through.
    const order = await mod.get(orderId);
    const allowed = purchaseOrderStatusChanges(
      order.status,
      mod.statusChanges ?? [],
      mod.deletableStatuses
    );
    if (!allowed.includes(change)) {
      return { ok: false, error: 'That change is not possible for this purchase order now.' };
    }
    const updated = await mod.setStatus(orderId, change);
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: updated.id } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
