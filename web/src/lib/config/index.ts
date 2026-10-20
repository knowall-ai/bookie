import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import { DEMO_GUEST } from '@/lib/auth/dev';
import { DEMO_ACCOUNTS_MAILBOX, DEMO_AGENT_ADDRESS } from '@/lib/email/demo';
import { FileConfigStore, MemoryConfigStore, SharePointConfigStore } from './stores';
import { DEFAULT_SETTINGS, type ConfigStore, type TenantSettings } from './types';

export * from './types';

/**
 * The config store for the signed-in user's tenant. Always scoped by the
 * tenant id from the verified sign-in, never by anything the browser sends.
 */
/** The demo tenant starts with one access entry: its guest accountant sees Contoso Coffee Roasters only. */
export const DEMO_SETTINGS: TenantSettings = {
  ...DEFAULT_SETTINGS,
  access: {
    membersSeeAll: true,
    people: [{ email: DEMO_GUEST.email, name: DEMO_GUEST.name, orgKeys: ['demo.contoso'] }],
  },
  email: { agentAddress: DEMO_AGENT_ADDRESS, accountsMailbox: DEMO_ACCOUNTS_MAILBOX },
};

export function configStoreFor(auth: AuthContext): ConfigStore {
  if (auth.mode === 'demo') return new MemoryConfigStore(auth.user.tenantId, DEMO_SETTINGS);
  const kind = process.env.BOOKIE_CONFIG_STORE ?? 'sharepoint';
  if (kind === 'file') return new FileConfigStore(auth.user.tenantId);
  if (kind !== 'sharepoint') throw new Error(`Unknown BOOKIE_CONFIG_STORE "${kind}".`);
  return new SharePointConfigStore(auth.user.tenantId, () => auth.getToken('graph'));
}
