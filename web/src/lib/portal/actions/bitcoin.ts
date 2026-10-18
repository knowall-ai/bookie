'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/context';
import { addWallet, removeWallet } from '@/lib/bitcoin/wallets';
import { describeError, type ActionResult } from './util';
import { addWalletSchema } from './bitcoin-schema';

/**
 * Settings › Bitcoin wallets (members only; enforced again in lib/bitcoin/wallets).
 * The key or descriptor is sealed per tenant and never sent back to the browser.
 */
export async function addBitcoinWalletAction(
  input: z.input<typeof addWalletSchema>
): Promise<ActionResult<{ name: string; typeLabel: string }>> {
  try {
    const auth = await requireAuth('/portal/settings');
    const parsed = addWalletSchema.parse(input);
    const wallet = await addWallet(auth, parsed);
    revalidatePath('/portal', 'layout');
    return { ok: true, data: { name: wallet.name, typeLabel: wallet.typeLabel } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function removeBitcoinWalletAction(id: string): Promise<ActionResult> {
  try {
    const auth = await requireAuth('/portal/settings');
    await removeWallet(auth, z.string().uuid().parse(id));
    revalidatePath('/portal', 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
