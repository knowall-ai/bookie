'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/context';
import {
  addXeroCustomConnection,
  removeConnection,
  updateConnectorSettings,
} from '@/lib/connections';
import { describeError, type ActionResult } from './util';

const customConnectionSchema = z.object({
  label: z.string().trim().max(120).optional(),
  clientId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{20,64}$/, 'That does not look like a Xero client ID.'),
  clientSecret: z.string().trim().min(20, 'That does not look like a Xero client secret.').max(200),
});

export async function addCustomConnectionAction(
  input: z.input<typeof customConnectionSchema>
): Promise<ActionResult<{ orgs: string[] }>> {
  try {
    const auth = await requireAuth('/portal/settings');
    const connection = await addXeroCustomConnection(auth, customConnectionSchema.parse(input));
    revalidatePath('/portal', 'layout');
    return { ok: true, data: { orgs: connection.orgs.map((o) => o.name) } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function removeConnectionAction(id: string): Promise<ActionResult> {
  try {
    const auth = await requireAuth('/portal/settings');
    await removeConnection(auth, z.string().uuid().parse(id));
    revalidatePath('/portal', 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

const settingsSchema = z.object({
  xeroEnabled: z.boolean().optional(),
  bcEnabled: z.boolean().optional(),
  hiddenCompanies: z.array(z.string().max(200)).max(500).optional(),
});

export async function updateSettingsAction(
  patch: z.input<typeof settingsSchema>
): Promise<ActionResult> {
  try {
    const auth = await requireAuth('/portal/settings');
    await updateConnectorSettings(auth, settingsSchema.parse(patch));
    revalidatePath('/portal', 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
