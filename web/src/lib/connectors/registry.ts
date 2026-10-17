import 'server-only';
import { cache } from 'react';
import { filterOrgsByAccess } from '@/lib/auth/access';
import type { AuthContext } from '@/lib/auth/context';
import { configStoreFor } from '@/lib/config';
import {
  DEFAULT_SETTINGS,
  type ConfigStore,
  type TenantSettings,
  type XeroConnection,
} from '@/lib/config/types';
import type { OrgRef } from '@/lib/domain/types';
import { BcClient, listBcCompanies, listBcEnvironments } from './bc/client';
import { createBcConnector } from './bc';
import { bookieExtension } from './bc/extension';
import { createDemoConnector, DEMO_ORGS } from './demo';
import { ConnectorError, type AccountingConnector } from './types';
import { XeroClient } from './xero/client';
import { createXeroConnector } from './xero';

/*
 * Org keys appear in URLs (`/portal/{key}/...`), so they carry ids only:
 *   xero.{connectionId}.{xeroTenantId}
 *   bc.{environment}.{companyId}
 *   demo.{slug}
 * A key is never trusted on its own: `getConnector` re-checks it against the
 * orgs the signed-in user can actually reach in their own tenant.
 */

export function xeroOrgKey(connectionId: string, xeroTenantId: string) {
  return `xero.${connectionId}.${xeroTenantId}`;
}

export function bcOrgKey(environment: string, companyId: string) {
  return `bc.${environment}.${companyId}`;
}

interface BcOrg extends OrgRef {
  companyName: string;
  companyId: string;
}

const bcDiscoveryCache = new Map<string, { at: number; orgs: BcOrg[] }>();
const BC_DISCOVERY_TTL = 5 * 60_000;

async function discoverBcOrgs(auth: AuthContext): Promise<BcOrg[]> {
  const cacheKey = `${auth.user.tenantId}:${auth.user.id}`;
  const hit = bcDiscoveryCache.get(cacheKey);
  if (hit && Date.now() - hit.at < BC_DISCOVERY_TTL) return hit.orgs;

  let token: string;
  try {
    token = await auth.getToken('bc');
  } catch {
    // No BC licence or consent in this tenant: simply no BC orgs.
    return [];
  }
  const environments = await listBcEnvironments(token).catch(() => []);
  const perEnvironment = await Promise.all(
    environments.map(async (environment) => {
      const companies = await listBcCompanies(auth.user.tenantId, environment.name, token).catch(
        () => []
      );
      return companies.map<BcOrg>((company) => ({
        key: bcOrgKey(environment.name, company.id),
        kind: 'business-central',
        name: company.displayName || company.name,
        companyName: company.name,
        companyId: company.id,
        environment: environment.name,
        sourceLabel: `Business Central · ${environment.name}`,
        country: environment.countryCode,
      }));
    })
  );
  const orgs = perEnvironment.flat();
  bcDiscoveryCache.set(cacheKey, { at: Date.now(), orgs });
  return orgs;
}

export function forgetBcDiscovery(auth: AuthContext) {
  bcDiscoveryCache.delete(`${auth.user.tenantId}:${auth.user.id}`);
}

function xeroOrgs(connections: XeroConnection[]): OrgRef[] {
  return connections.flatMap((connection) =>
    connection.orgs.map<OrgRef>((org) => ({
      key: xeroOrgKey(connection.id, org.xeroTenantId),
      kind: 'xero',
      name: org.name,
      sourceLabel: 'Xero',
      country: org.country,
      baseCurrency: org.baseCurrency,
    }))
  );
}

export interface OrgDirectory {
  /** The orgs this user may open: reachable, not hidden, and allowed by the tenant's access entries. */
  orgs: OrgRef[];
  /**
   * Every reachable, non-hidden org before access entries are applied. Only for
   * Settings (members only) and tenant-wide jobs; never to authorise a request.
   */
  allOrgs: OrgRef[];
  /** BC companies the user can see but chose to hide in Settings. */
  hiddenBcOrgs: OrgRef[];
  store: ConfigStore;
  /** The tenant's settings as read for this request (defaults when the store failed). */
  settings?: TenantSettings;
  /** Set when the tenant's settings store could not be read; the portal still opens with BC. */
  storeError?: string;
}

/**
 * Every org the signed-in user can switch to. Memoised per request. This is
 * the single gate for org access: `getConnector`, `orgContext`, Bookie's
 * routes and the Live feed all resolve org keys against `orgs` here.
 */
export const listOrgs = cache(async (auth: AuthContext): Promise<OrgDirectory> => {
  const store = configStoreFor(auth);
  if (auth.mode === 'demo') {
    const settings = await store.getSettings();
    return {
      orgs: filterOrgsByAccess(DEMO_ORGS, auth.user, settings.access),
      allOrgs: DEMO_ORGS,
      hiddenBcOrgs: [],
      store,
      settings,
    };
  }

  let settings = structuredClone(DEFAULT_SETTINGS);
  let connections: Awaited<ReturnType<ConfigStore['listConnections']>> = [];
  let storeError: string | undefined;
  try {
    [settings, connections] = await Promise.all([store.getSettings(), store.listConnections()]);
  } catch (error) {
    console.error('[bookie] settings store unavailable', error);
    storeError = error instanceof Error ? error.message : 'Settings could not be read.';
  }
  const xero = settings.xero.enabled ? xeroOrgs(connections.filter((c) => c.kind === 'xero')) : [];
  const bc = settings.businessCentral.enabled ? await discoverBcOrgs(auth) : [];
  const hidden = new Set(settings.businessCentral.hiddenCompanies);
  const allOrgs = [
    ...xero.sort((a, b) => a.name.localeCompare(b.name)),
    ...bc.filter((o) => !hidden.has(o.key)).sort((a, b) => a.name.localeCompare(b.name)),
  ];
  return {
    // When the settings store can't be read, access entries are unknown: guests see nothing.
    orgs: filterOrgsByAccess(allOrgs, auth.user, settings.access),
    allOrgs,
    hiddenBcOrgs: bc.filter((o) => hidden.has(o.key)),
    store,
    settings,
    storeError,
  };
});

/** Build the connector for an org key, after checking the user can reach it. */
export const getConnector = cache(
  async (auth: AuthContext, orgKey: string): Promise<AccountingConnector> => {
    const { orgs, store } = await listOrgs(auth);
    const org = orgs.find((o) => o.key === orgKey);
    if (!org) throw new ConnectorError('Organisation not found.', 404, 'demo');

    if (org.kind === 'demo') return createDemoConnector(org);

    if (org.kind === 'xero') {
      const [, connectionId, xeroTenantId] = orgKey.split('.');
      const connection = (await store.getConnection(connectionId)) as XeroConnection | undefined;
      const meta = connection?.orgs.find((o) => o.xeroTenantId === xeroTenantId);
      if (!connection || !meta) throw new ConnectorError('Xero connection not found.', 404, 'xero');
      const client = new XeroClient({
        ownerTenantId: auth.user.tenantId,
        connection,
        xeroTenantId,
        onRefreshTokenRotated: async (refreshToken) => {
          if (connection.auth.type === 'oauth') {
            await store.saveConnection({
              ...connection,
              auth: { ...connection.auth, refreshToken },
              updatedAt: new Date().toISOString(),
            });
          }
        },
      });
      return createXeroConnector({ org, client, shortCode: meta.shortCode });
    }

    const bcOrg = org as BcOrg;
    const client = new BcClient({
      tenantId: auth.user.tenantId,
      environment: bcOrg.environment!,
      companyId: bcOrg.companyId,
      token: () => auth.getToken('bc'),
    });
    // The optional Bookie BC extension adds writes (payment registration), so detect it
    // up front (cached 10 minutes per tenant, environment and company).
    const extension = await bookieExtension(client);
    return createBcConnector({ org, client, companyName: bcOrg.companyName, extension });
  }
);
