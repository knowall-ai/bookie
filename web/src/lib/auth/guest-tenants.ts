/**
 * Host tenants that guests (Entra B2B users, such as an external accountant)
 * can sign in to. A guest signing in through the default `organizations`
 * authority lands in their *home* tenant; signing in through a host tenant's
 * own authority gives a token for the host tenant instead.
 *
 * Configured with BOOKIE_GUEST_TENANTS = `tenantId:Display Name;tenantId2:Name2`.
 * Each entry becomes an extra Microsoft Entra provider, `azure-ad-<first 8 chars>`,
 * whose redirect URI is `/api/auth/callback/<providerId>`.
 */

export interface GuestTenant {
  tenantId: string;
  name: string;
  providerId: string;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function guestProviderId(tenantId: string): string {
  return `azure-ad-${tenantId.slice(0, 8).toLowerCase()}`;
}

/** Parse BOOKIE_GUEST_TENANTS. Malformed entries are skipped with a warning, never guessed at. */
export function parseGuestTenants(raw: string | undefined): GuestTenant[] {
  if (!raw?.trim()) return [];
  const tenants: GuestTenant[] = [];
  for (const part of raw.split(';')) {
    const entry = part.trim();
    if (!entry) continue;
    const colon = entry.indexOf(':');
    const tenantId = (colon === -1 ? entry : entry.slice(0, colon)).trim().toLowerCase();
    const name = colon === -1 ? '' : entry.slice(colon + 1).trim();
    if (!GUID.test(tenantId) || !name) {
      console.warn(`[bookie] ignoring malformed BOOKIE_GUEST_TENANTS entry "${entry}"`);
      continue;
    }
    if (tenants.some((t) => t.tenantId === tenantId)) continue;
    tenants.push({ tenantId, name, providerId: guestProviderId(tenantId) });
  }
  return tenants;
}

export function guestTenants(): GuestTenant[] {
  return parseGuestTenants(process.env.BOOKIE_GUEST_TENANTS);
}

/** The configured display name for a tenant, if it is a guest host tenant. */
export function guestTenantName(tenantId: string): string | undefined {
  return guestTenants().find((t) => t.tenantId === tenantId.toLowerCase())?.name;
}
