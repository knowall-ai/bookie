'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCanManageSettings } from '@/lib/auth/access';
import { configStoreFor } from '@/lib/config';
import { ElectrumClient, ElectrumError } from '@/lib/bitcoin/electrum';
import { validateOrgElectrumUrl } from '@/lib/bitcoin/electrum-guard';
import { requireAuth } from '@/lib/auth/context';
import {
  addWallet,
  receiveAddress,
  removeWallet,
  type ReceiveAddress,
} from '@/lib/bitcoin/wallets';
import { orgContext } from '@/lib/portal/context';
import { describeError, type ActionResult } from './util';
import { addWalletSchema, receiveAddressSchema, electrumServerSchema } from './bitcoin-schema';

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

/**
 * A wallet's Receive dialog: a fresh receive address derived on the server from the
 * descriptor and the live scan. Read-only; the organisation is re-resolved with
 * orgContext() and the wallet from its source, as on the wallet page.
 */
export async function bitcoinReceiveAddressAction(
  input: z.input<typeof receiveAddressSchema>
): Promise<ActionResult<ReceiveAddress>> {
  try {
    const parsed = receiveAddressSchema.parse(input);
    const auth = await requireAuth(`/portal/${encodeURIComponent(parsed.orgKey)}`);
    const { org, connector } = await orgContext(encodeURIComponent(parsed.orgKey));
    return { ok: true, data: await receiveAddress(auth, { org, connector }, parsed.walletId) };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function saveElectrumServerAction(
  input: z.input<typeof electrumServerSchema>
): Promise<ActionResult<{ url: string }>> {
  try {
    const auth = await requireAuth('/portal/settings');
    assertCanManageSettings(auth.user);
    const electrum = electrumServerSchema.parse(input);
    if (auth.mode !== 'demo') {
      // connect includes a server.version request and closes on handshake failure.
      const client = await ElectrumClient.connect(validateOrgElectrumUrl(electrum.url), {
        certSha256: electrum.certSha256,
      });
      client.close();
    }
    const store = configStoreFor(auth);
    const settings = await store.getSettings();
    await store.saveSettings({ ...settings, bitcoin: { ...settings.bitcoin, electrum } });
    revalidatePath('/portal', 'layout');
    return { ok: true, data: { url: electrum.url } };
  } catch (error) {
    if (error instanceof ElectrumError) {
      console.error('[bookie] Electrum test failed:', error.message, error.detail ?? '');
      return { ok: false, error: error.message };
    }
    return { ok: false, error: describeError(error) };
  }
}

export async function clearElectrumServerAction(): Promise<ActionResult> {
  try {
    const auth = await requireAuth('/portal/settings');
    assertCanManageSettings(auth.user);
    const store = configStoreFor(auth);
    const settings = await store.getSettings();
    const bitcoin = { ...settings.bitcoin };
    delete bitcoin.electrum;
    await store.saveSettings({ ...settings, bitcoin });
    revalidatePath('/portal', 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
