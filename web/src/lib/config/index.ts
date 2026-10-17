import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import { FileConfigStore, MemoryConfigStore, SharePointConfigStore } from './stores';
import type { ConfigStore } from './types';

export * from './types';

/**
 * The config store for the signed-in user's tenant. Always scoped by the
 * tenant id from the verified sign-in, never by anything the browser sends.
 */
export function configStoreFor(auth: AuthContext): ConfigStore {
  if (auth.mode === 'demo') return new MemoryConfigStore(auth.user.tenantId);
  const kind = process.env.BOOKIE_CONFIG_STORE ?? 'sharepoint';
  if (kind === 'file') return new FileConfigStore(auth.user.tenantId);
  if (kind !== 'sharepoint') throw new Error(`Unknown BOOKIE_CONFIG_STORE "${kind}".`);
  return new SharePointConfigStore(auth.user.tenantId, () => auth.getToken('graph'));
}
