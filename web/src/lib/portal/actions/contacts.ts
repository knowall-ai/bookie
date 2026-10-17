'use server';

import { revalidatePath } from 'next/cache';
import { orgContext } from '@/lib/portal/context';
import type { ContactInput } from '@/lib/domain/types';
import { describeError, type ActionResult } from './util';
import { parseContactInput } from './contact-schema';

export async function saveContact(
  orgKey: string,
  id: string | undefined,
  input: ContactInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = parseContactInput(input, id ? 'update' : 'create');
    const { connector, base } = await orgContext(orgKey);
    const mod = connector.contacts;
    const save = id ? mod?.update?.bind(null, id) : mod?.create;
    if (!save)
      return { ok: false, error: 'This organisation does not allow editing contacts here.' };
    const contact = await save(parsed);
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: contact.id } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function archiveContact(orgKey: string, id: string): Promise<ActionResult> {
  try {
    if (typeof id !== 'string' || !id) return { ok: false, error: 'Choose a contact.' };
    const { connector, base } = await orgContext(orgKey);
    const archive = connector.contacts?.archive;
    if (!archive)
      return { ok: false, error: 'This organisation does not allow archiving contacts here.' };
    await archive(id);
    revalidatePath(base, 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
