'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/context';
import {
  addAccessPersonFromDirectory,
  addXeroCustomConnection,
  removeConnection,
  searchPeople,
  updateAccessSettings,
  updateConnectorSettings,
  updateEmailSettings,
} from '@/lib/connections';
import { ENTRA_ID, type DirectoryPerson } from '@/lib/directory/types';
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

const userIdSchema = z
  .string()
  .trim()
  .regex(ENTRA_ID, 'That is not someone from your Microsoft 365 directory.');

const identitySchema = z.object({
  userId: userIdSchema.optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(320),
});

const accessGrantSchema = identitySchema.extend({
  orgKeys: z.union([z.literal('all'), z.array(orgKeySchema).max(500)]),
});

const directoryQuerySchema = z
  .string()
  .trim()
  .min(2, 'Type at least 2 characters.')
  .max(100, 'That search is too long.');

/** People and access: search the directory (members only), for the people picker. */
export async function searchDirectoryAction(
  query: string
): Promise<ActionResult<DirectoryPerson[]>> {
  try {
    const auth = await requireAuth('/portal/settings');
    return { ok: true, data: await searchPeople(auth, directoryQuerySchema.parse(query)) };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** Add someone picked from the directory, by Entra object id. They start with no organisations. */
export async function addAccessPersonAction(
  userId: string
): Promise<ActionResult<{ name: string; email: string }>> {
  try {
    const auth = await requireAuth('/portal/settings');
    const person = await addAccessPersonFromDirectory(auth, userIdSchema.parse(userId));
    revalidatePath('/portal', 'layout');
    return { ok: true, data: { name: person.name, email: person.email } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** Change the organisations of someone already listed (matched by Entra object id, then email). */
export async function saveAccessPersonAction(
  input: z.input<typeof accessGrantSchema>
): Promise<ActionResult> {
  try {
    const auth = await requireAuth('/portal/settings');
    const { orgKeys, ...who } = accessGrantSchema.parse(input);
    await updateAccessSettings(auth, {
      type: 'grant',
      who,
      orgKeys: Array.isArray(orgKeys) ? [...new Set(orgKeys)] : orgKeys,
    });
    revalidatePath('/portal', 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function removeAccessPersonAction(
  who: z.input<typeof identitySchema>
): Promise<ActionResult> {
  try {
    const auth = await requireAuth('/portal/settings');
    await updateAccessSettings(auth, { type: 'remove', who: identitySchema.parse(who) });
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

/* ------------------------------------------------------------------ */
/* Bookie's emails (members only; enforced in lib/connections.ts).     */
/* ------------------------------------------------------------------ */

const mailboxSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .refine(
    (v) => v === '' || z.string().email().safeParse(v).success,
    'Enter a valid email address.'
  );

const emailSettingsSchema = z.strictObject({
  agentAddress: mailboxSchema,
  accountsMailbox: mailboxSchema,
});

export async function saveEmailSettingsAction(
  input: z.input<typeof emailSettingsSchema>
): Promise<ActionResult> {
  try {
    const auth = await requireAuth('/portal/settings');
    const { agentAddress, accountsMailbox } = emailSettingsSchema.parse(input);
    await updateEmailSettings(auth, {
      agentAddress: agentAddress || undefined,
      accountsMailbox: accountsMailbox || undefined,
    });
    revalidatePath('/portal', 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
