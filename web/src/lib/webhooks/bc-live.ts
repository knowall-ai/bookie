import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import { listOrgs } from '@/lib/connectors/registry';
import {
  ensureBcSubscriptions,
  removeBcSubscriptions,
  type SubscriptionSummary,
} from './bc-subscriptions';

/** BC orgs keys are `bc.{environment}.{companyId}`; group the visible ones by environment. */
function companiesByEnvironment(keys: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const key of keys) {
    const parts = key.split('.');
    if (parts[0] !== 'bc' || parts.length < 3) continue;
    const companyId = parts[parts.length - 1];
    const environment = parts.slice(1, -1).join('.');
    map.set(environment, [...(map.get(environment) ?? []), companyId]);
  }
  return map;
}

/**
 * Bring the tenant's BC webhook subscriptions in line with "Live updates":
 * on = every visible company subscribed (created, renewed or kept);
 * off = all of Bookie's subscriptions removed. Runs as the signed-in user.
 */
export async function syncBcLiveUpdates(
  auth: AuthContext,
  enabled: boolean
): Promise<SubscriptionSummary> {
  const { orgs } = await listOrgs(auth);
  const byEnvironment = companiesByEnvironment(
    orgs.filter((o) => o.kind === 'business-central').map((o) => o.key)
  );
  const token = await auth.getToken('bc');
  const total: SubscriptionSummary = { created: 0, renewed: 0, kept: 0, removed: 0 };
  for (const [environment, companyIds] of byEnvironment) {
    const target = { tenantId: auth.user.tenantId, environment, token };
    const summary = enabled
      ? await ensureBcSubscriptions(target, companyIds)
      : await removeBcSubscriptions(target);
    total.created += summary.created;
    total.renewed += summary.renewed;
    total.kept += summary.kept;
    total.removed += summary.removed;
  }
  return total;
}
