'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { PurchaseOrderInput } from '@/lib/domain/types';
import { describeError, isoDate, lineItemSchema, type ActionResult } from './util';

const purchaseOrderSchema = z.object({
  contactId: z.string().min(1, 'Choose a supplier.'),
  date: isoDate,
  deliveryDate: isoDate.optional(),
  reference: z.string().trim().max(255).optional(),
  currency: z.string().length(3).optional(),
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
