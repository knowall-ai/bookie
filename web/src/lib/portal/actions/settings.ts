'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/context';
import {
  addXeroCustomConnection,
  removeConnection,
  updateAccessSettings,
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

/* ------------------------------------------------------------------ */
/* People and access (members only; enforced in lib/connections.ts).   */
/* ------------------------------------------------------------------ */

const orgKeySchema = z
  .string()
  .max(300)
  .regex(/^(xero|bc|demo)\.[\w.-]+$/, 'That is not an organisation Bookie knows.');

const accessPersonSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(320),
  name: z.string().trim().max(120).optional(),
  orgKeys: z.union([z.literal('all'), z.array(orgKeySchema).max(500)]),
});

export async function saveAccessPersonAction(
  input: z.input<typeof accessPersonSchema>
): Promise<ActionResult> {
  try {
    const auth = await requireAuth('/portal/settings');
    const person = accessPersonSchema.parse(input);
    if (Array.isArray(person.orgKeys)) person.orgKeys = [...new Set(person.orgKeys)];
    await updateAccessSettings(auth, { type: 'upsert', person });
    revalidatePath('/portal', 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function removeAccessPersonAction(email: string): Promise<ActionResult> {
  try {
    const auth = await requireAuth('/portal/settings');
    await updateAccessSettings(auth, {
      type: 'remove',
      email: accessPersonSchema.shape.email.parse(email),
    });
    revalidatePath('/portal', 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function setMembersSeeAllAction(value: boolean): Promise<ActionResult> {
  try {
    const auth = await requireAuth('/portal/settings');
    await updateAccessSettings(auth, { type: 'membersSeeAll', value: z.boolean().parse(value) });
    revalidatePath('/portal', 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
