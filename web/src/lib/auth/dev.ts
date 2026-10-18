import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RESOURCES, type ResourceName } from './resources';
import type { AuthContext } from './context';

const run = promisify(execFile);

export type DevAuthMode = 'azure-cli' | 'demo' | 'demo-guest';

const DEV_MODES: DevAuthMode[] = ['azure-cli', 'demo', 'demo-guest'];

export const DEMO_TENANT_ID = '00000000-0000-0000-0000-00000000d3e0';

/** The fictional demo users: a Contoso member, and an external accountant who is a guest. */
export const DEMO_MEMBER: AuthContext['user'] = {
  id: '00000000-0000-0000-0000-00000000d301',
  tenantId: DEMO_TENANT_ID,
  name: 'Alex Morgan',
  email: 'alex.morgan@contoso.example',
  userType: 'Member',
};

export const DEMO_GUEST: AuthContext['user'] = {
  id: '00000000-0000-0000-0000-00000000d302',
  tenantId: DEMO_TENANT_ID,
  name: 'Jordan Lee',
  email: 'jordan.lee@fabrikam.example',
  userType: 'Guest',
};

/** The demo tenant's display name, used in "Ask an administrator at …". */
export const DEMO_TENANT_NAME = 'Contoso';

/**
 * Development-only sign-in shortcuts, selected with BOOKIE_DEV_AUTH.
 *
 * - `azure-cli`: act as whoever is signed in to the Azure CLI on this machine,
 *   so a developer can check real data locally without an interactive login.
 * - `demo`: a fictional Contoso user that only sees the built-in demo org.
 *   Used by Playwright and for public screenshots.
 * - `demo-guest`: a fictional external accountant, a guest in the demo tenant,
 *   with an access entry for Contoso Coffee Roasters only.
 *
 * All are refused outright in a production build.
 */
export function devAuthMode(): DevAuthMode | null {
  const mode = process.env.BOOKIE_DEV_AUTH;
  if (!mode) return null;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BOOKIE_DEV_AUTH must not be set in production.');
  }
  if (!DEV_MODES.includes(mode as DevAuthMode)) {
    throw new Error(`Unknown BOOKIE_DEV_AUTH mode "${mode}".`);
  }
  return mode as DevAuthMode;
}

const cliTokens = new Map<ResourceName, { token: string; expiresAt: number }>();

async function azureCliToken(resource: ResourceName): Promise<string> {
  const hit = cliTokens.get(resource);
  if (hit && hit.expiresAt - 60_000 > Date.now()) return hit.token;
  const { stdout } = await run('az', [
    'account',
    'get-access-token',
    '--resource',
    RESOURCES[resource],
    '-o',
    'json',
  ]);
  const parsed = JSON.parse(stdout) as { accessToken: string; expires_on?: number };
  cliTokens.set(resource, {
    token: parsed.accessToken,
    expiresAt: parsed.expires_on ? parsed.expires_on * 1000 : Date.now() + 30 * 60_000,
  });
  return parsed.accessToken;
}

let cliUser: AuthContext['user'] | null = null;

async function azureCliUser(): Promise<AuthContext['user']> {
  if (cliUser) return cliUser;
  const token = await azureCliToken('graph');
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  cliUser = {
    id: claims.oid,
    tenantId: claims.tid,
    name: claims.name ?? claims.upn ?? 'Azure CLI user',
    email: claims.upn ?? claims.unique_name ?? '',
    // The Azure CLI user is a developer in their own tenant.
    userType: 'Member',
  };
  return cliUser;
}

export async function devAuthContext(mode: DevAuthMode): Promise<AuthContext> {
  if (mode === 'demo' || mode === 'demo-guest') {
    return {
      mode: 'demo',
      user: mode === 'demo' ? DEMO_MEMBER : DEMO_GUEST,
      getToken: async () => {
        throw new Error('The demo user has no Microsoft tokens.');
      },
    };
  }
  return { mode, user: await azureCliUser(), getToken: azureCliToken };
}
