import 'server-only';
import { getAuthContext, type AuthContext } from '@/lib/auth/context';
import { getConnector, listOrgs } from '@/lib/connectors/registry';
import type { AccountingConnector } from '@/lib/connectors/types';
import type { OrgRef } from '@/lib/domain/types';

/** Resolve the caller and (optionally) the open org, with the same checks as the portal. */
export async function bookieContext(
  orgKey: string | undefined
): Promise<
  | { ok: true; auth: AuthContext; org?: OrgRef; connector?: AccountingConnector }
  | { ok: false; status: number; error: string }
> {
  const auth = await getAuthContext();
  if (!auth) return { ok: false, status: 401, error: 'Please sign in.' };
  if (!orgKey) return { ok: true, auth };
  const { orgs } = await listOrgs(auth);
  const org = orgs.find((o) => o.key === orgKey);
  if (!org) return { ok: false, status: 404, error: 'Organisation not found.' };
  return { ok: true, auth, org, connector: await getConnector(auth, orgKey) };
}

const buckets = new Map<string, { tokens: number; at: number }>();

/** Simple per-user token bucket: `perMinute` requests, refilled continuously. */
export function rateLimit(key: string, perMinute = 20): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: perMinute, at: now };
  bucket.tokens = Math.min(perMinute, bucket.tokens + ((now - bucket.at) / 60_000) * perMinute);
  bucket.at = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  if (buckets.size > 10_000) buckets.clear();
  return true;
}
