import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import { configStoreFor } from '@/lib/config';
import type { PlannedItem } from './types';

/**
 * Planned items live in the tenant's sealed settings (in the customer's own
 * SharePoint, or the local file / memory store in development and demo), keyed
 * by org key. They are the user's own assumptions, not accounting data.
 */
export async function loadPlannedItems(auth: AuthContext, orgKey: string): Promise<PlannedItem[]> {
  const settings = await configStoreFor(auth).getSettings();
  return structuredClone(settings.forecast?.[orgKey]?.planned ?? []);
}

export async function savePlannedItems(
  auth: AuthContext,
  orgKey: string,
  items: PlannedItem[]
): Promise<void> {
  const store = configStoreFor(auth);
  const settings = await store.getSettings();
  settings.forecast = { ...settings.forecast, [orgKey]: { planned: items } };
  await store.saveSettings(settings);
}
