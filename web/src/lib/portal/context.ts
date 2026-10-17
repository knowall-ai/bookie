import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { requireAuth } from '@/lib/auth/context';
import { getConnector, listOrgs } from '@/lib/connectors/registry';
import { isConnectorError, type AccountingConnector } from '@/lib/connectors/types';
import type { OrgRef } from '@/lib/domain/types';
import { moduleAvailability, type ModuleAvailability } from './nav';

export interface OrgContext {
  org: OrgRef;
  orgs: OrgRef[];
  connector: AccountingConnector;
  /** `/portal/{orgKey}`: prefix for every link inside this org. */
  base: string;
  modules: ModuleAvailability;
}

/**
 * Resolve `/portal/[org]/...` to a connector the signed-in user may use.
 * Unknown or foreign org keys 404, never leak whether they exist.
 */
export const orgContext = cache(async (orgParam: string): Promise<OrgContext> => {
  const orgKey = decodeURIComponent(orgParam);
  const auth = await requireAuth(`/portal/${orgParam}`);
  const { orgs } = await listOrgs(auth);
  const org = orgs.find((o) => o.key === orgKey);
  if (!org) notFound();
  try {
    const connector = await getConnector(auth, orgKey);
    return {
      org,
      orgs,
      connector,
      base: `/portal/${encodeURIComponent(orgKey)}`,
      modules: moduleAvailability(connector),
    };
  } catch (error) {
    if (isConnectorError(error) && error.status === 404) notFound();
    throw error;
  }
});

/** Human name of the source system, for messages such as "Open in Xero". */
export function sourceName(org: OrgRef): string {
  return org.kind === 'xero'
    ? 'Xero'
    : org.kind === 'business-central'
      ? 'Business Central'
      : 'the demo';
}
