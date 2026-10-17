'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/context';
import { orgContext } from '@/lib/portal/context';
import { loadPlannedItems, savePlannedItems } from '@/lib/forecast/planned';
import type { PlannedItem } from '@/lib/forecast/types';
import { MAX_PLANNED_ITEMS, plannedItemSchema, type PlannedItemInput } from './forecast-schema';
import { describeError, type ActionResult } from './util';

/**
 * Planned items are the user's own forecast assumptions, saved in Bookie's
 * sealed settings. They never touch the books, so there's no ConfirmDialog
 * for saving one (deleting asks first, in the UI).
 */
export async function savePlannedItem(
  orgKey: string,
  id: string | undefined,
  input: PlannedItemInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = plannedItemSchema.parse(input);
    const { org, base } = await orgContext(orgKey);
    const auth = await requireAuth(base);
    const items = await loadPlannedItems(auth, org.key);
    const itemId = id ? z.string().uuid().parse(id) : randomUUID();
    const existing = items.find((i) => i.id === itemId);
    if (id && !existing) return { ok: false, error: 'That planned item no longer exists.' };
    if (!id && items.length >= MAX_PLANNED_ITEMS) {
      return { ok: false, error: `You can plan up to ${MAX_PLANNED_ITEMS} items.` };
    }
    const item: PlannedItem = {
      id: itemId,
      description: parsed.description,
      amount: parsed.amount,
      direction: parsed.direction,
      currency: parsed.currency,
      date: parsed.date,
      repeat: parsed.repeat,
      endDate: parsed.repeat ? parsed.endDate : undefined,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await savePlannedItems(
      auth,
      org.key,
      existing ? items.map((i) => (i.id === itemId ? item : i)) : [...items, item]
    );
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: itemId } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function deletePlannedItem(orgKey: string, id: string): Promise<ActionResult> {
  try {
    const itemId = z.string().uuid().parse(id);
    const { org, base } = await orgContext(orgKey);
    const auth = await requireAuth(base);
    const items = await loadPlannedItems(auth, org.key);
    await savePlannedItems(
      auth,
      org.key,
      items.filter((i) => i.id !== itemId)
    );
    revalidatePath(base, 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
