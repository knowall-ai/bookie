/**
 * Which organisations may use Bookie. Only Microsoft Entra tenants KnowAll has
 * approved can sign in: KnowAll's own tenant, plus every tenant id listed in
 * APPROVED_TENANT_IDS (comma-separated GUIDs). Everyone else is shown the
 * "not set up yet" page and gets no data. See docs/ACCESS.adoc.
 *
 * Guests invited into an approved tenant (Entra B2B, such as an external
 * accountant) sign in through that tenant, so their token carries its id and
 * they are allowed; per-person access (`access.ts`) still decides what they see.
 */

/** KnowAll AI's own Entra tenant: always approved. */
export const KNOWALL_TENANT_ID = 'f36f6414-cb7d-4545-9cf2-7574f7b5c584';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A lowercased tenant id, or `undefined` when it isn't a GUID (never guessed at). */
export function normaliseTenantId(tenantId: unknown): string | undefined {
  if (typeof tenantId !== 'string') return undefined;
  const id = tenantId.trim().toLowerCase();
  return GUID.test(id) ? id : undefined;
}

/** Parse APPROVED_TENANT_IDS. Malformed entries are skipped with a warning. */
export function parseApprovedTenantIds(raw: string | undefined): Set<string> {
  const ids = new Set<string>();
  for (const part of raw?.split(',') ?? []) {
    if (!part.trim()) continue;
    const id = normaliseTenantId(part);
    if (id) ids.add(id);
    else console.warn(`[bookie] ignoring malformed APPROVED_TENANT_IDS entry "${part.trim()}"`);
  }
  return ids;
}

/**
 * Whether this tenant may use Bookie. A missing or malformed tenant id is never
 * approved: there is no default tenant to fall back to.
 */
export function isApprovedTenant(
  tenantId: string | undefined | null,
  raw: string | undefined = process.env.APPROVED_TENANT_IDS
): boolean {
  const id = normaliseTenantId(tenantId);
  if (!id) return false;
  return id === KNOWALL_TENANT_ID || parseApprovedTenantIds(raw).has(id);
}
