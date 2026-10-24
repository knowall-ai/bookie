import 'server-only';
import type { AuthContext } from './context';
import { demoTenantName } from './dev';
import { guestTenantName } from './guest-tenants';

const names = new Map<string, { at: number; name: string | undefined }>();
const TTL = 60 * 60_000;

/**
 * The signed-in tenant's display name ("KnowAll AI"), for copy such as "Ask an
 * administrator at …". From BOOKIE_GUEST_TENANTS when configured, otherwise
 * Microsoft Graph `/organization`. `undefined` when neither can say (guests
 * often can't read the directory): callers then use a neutral phrase.
 */
export async function tenantDisplayName(auth: AuthContext): Promise<string | undefined> {
  if (auth.mode === 'demo') return demoTenantName(auth.user.tenantId);
  const configured = guestTenantName(auth.user.tenantId);
  if (configured) return configured;
  const hit = names.get(`${auth.user.tenantId}:${auth.user.userType}`);
  if (hit && Date.now() - hit.at < TTL) return hit.name;
  try {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/organization?$select=displayName',
      { headers: { Authorization: `Bearer ${await auth.getToken('graph')}` }, cache: 'no-store' }
    );
    // Not allowed (typical for guests) is an answer worth remembering; a network blip is not.
    if (!response.ok && response.status !== 403) return undefined;
    const body = response.ok
      ? ((await response.json()) as { value?: { displayName?: string }[] })
      : undefined;
    const name = body?.value?.[0]?.displayName || undefined;
    if (names.size > 5000) names.clear();
    names.set(`${auth.user.tenantId}:${auth.user.userType}`, { at: Date.now(), name });
    return name;
  } catch {
    return undefined;
  }
}
