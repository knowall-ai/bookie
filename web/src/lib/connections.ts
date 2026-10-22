import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  AccessChangeError,
  accessEntryIndex,
  assertCanManageSettings,
  removeAccessPerson,
  upsertAccessPerson,
  type AccessIdentity,
} from '@/lib/auth/access';
import type { AuthContext } from '@/lib/auth/context';
import { configStoreFor } from '@/lib/config';
import type { AccessPerson, EmailSettings, XeroConnection, XeroOrgMeta } from '@/lib/config/types';
import { forgetBcDiscovery } from '@/lib/connectors/registry';
import { ConnectorError } from '@/lib/connectors/types';
import { XeroClient } from '@/lib/connectors/xero/client';
import { getDirectoryPerson, searchDirectory } from '@/lib/directory/graph';
import type { DirectoryPerson } from '@/lib/directory/types';

/** Organisations reachable with a Xero access token, with the details Bookie shows. */
async function describeXeroOrgs(accessToken: string, only?: string[]): Promise<XeroOrgMeta[]> {
  const response = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok)
    throw new ConnectorError(
      'Xero did not list any organisations for these details.',
      response.status,
      'xero'
    );
  const tenants = (
    (await response.json()) as { tenantId: string; tenantName: string; tenantType: string }[]
  ).filter((t) => t.tenantType === 'ORGANISATION' && (!only || only.includes(t.tenantId)));
  return Promise.all(
    tenants.map(async (t) => {
      const org = await fetch('https://api.xero.com/api.xro/2.0/Organisation', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Xero-tenant-id': t.tenantId,
          Accept: 'application/json',
        },
        cache: 'no-store',
      })
        .then((r) => (r.ok ? r.json() : undefined))
        .then(
          (b) =>
            (
              b as
                | {
                    Organisations?: {
                      BaseCurrency?: string;
                      CountryCode?: string;
                      ShortCode?: string;
                    }[];
                  }
                | undefined
            )?.Organisations?.[0]
        )
        .catch(() => undefined);
      return {
        xeroTenantId: t.tenantId,
        name: t.tenantName,
        baseCurrency: org?.BaseCurrency,
        country: org?.CountryCode,
        shortCode: org?.ShortCode,
      };
    })
  );
}

function newConnection(
  auth: AuthContext,
  label: string,
  connectionAuth: XeroConnection['auth']
): XeroConnection {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    kind: 'xero',
    label,
    auth: connectionAuth,
    orgs: [],
    createdBy: auth.user.email || auth.user.id,
    createdAt: now,
    updatedAt: now,
  };
}

/** Add (or refresh) a Xero Custom Connection: one organisation, client id + secret. */
export async function addXeroCustomConnection(
  auth: AuthContext,
  input: { label?: string; clientId: string; clientSecret: string }
): Promise<XeroConnection> {
  assertCanManageSettings(auth.user);
  const store = configStoreFor(auth);
  const connection = newConnection(auth, input.label || 'Custom Connection', {
    type: 'custom-connection',
    clientId: input.clientId,
    clientSecret: input.clientSecret,
  });
  const client = new XeroClient({
    ownerTenantId: auth.user.tenantId,
    connection,
    xeroTenantId: '',
  });
  connection.orgs = await describeXeroOrgs(await client.accessToken());
  if (connection.orgs.length === 0)
    throw new ConnectorError(
      'These keys did not give access to any Xero organisation.',
      400,
      'xero'
    );
  if (!input.label) connection.label = connection.orgs[0].name;

  const existing = (await store.listConnections()).find(
    (c) => c.auth.type === 'custom-connection' && c.auth.clientId === input.clientId
  );
  if (existing) connection.id = existing.id;
  await store.saveConnection(connection);
  return connection;
}

/** Store the result of the "Connect to Xero" OAuth flow. */
export async function addXeroOAuthConnection(
  auth: AuthContext,
  tokens: { accessToken: string; refreshToken: string }
): Promise<XeroConnection> {
  assertCanManageSettings(auth.user);
  const store = configStoreFor(auth);
  const orgs = await describeXeroOrgs(tokens.accessToken);
  if (orgs.length === 0)
    throw new ConnectorError('No Xero organisations were authorised.', 400, 'xero');
  const connection = newConnection(
    auth,
    orgs.length === 1 ? orgs[0].name : `${orgs.length} Xero organisations`,
    {
      type: 'oauth',
      refreshToken: tokens.refreshToken,
      tenantIds: orgs.map((o) => o.xeroTenantId),
    }
  );
  connection.orgs = orgs;
  // Drop organisations from older grants that this grant now covers, so nothing appears twice.
  for (const old of await store.listConnections()) {
    if (old.auth.type !== 'oauth') continue;
    const remaining = old.orgs.filter(
      (o) => !connection.orgs.some((n) => n.xeroTenantId === o.xeroTenantId)
    );
    if (remaining.length === 0) await store.deleteConnection(old.id);
    else if (remaining.length !== old.orgs.length)
      await store.saveConnection({ ...old, orgs: remaining });
  }
  await store.saveConnection(connection);
  return connection;
}

export async function removeConnection(auth: AuthContext, id: string): Promise<void> {
  assertCanManageSettings(auth.user);
  const store = configStoreFor(auth);
  const connection = await store.getConnection(id);
  if (!connection) return;
  if (connection.auth.type === 'oauth' && process.env.XERO_CLIENT_ID) {
    // Revoke the grant at Xero too, so a removed connection can't be reused.
    await fetch('https://identity.xero.com/connect/revocation', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: connection.auth.refreshToken }),
    }).catch(() => undefined);
  }
  await store.deleteConnection(id);
}

export async function updateConnectorSettings(
  auth: AuthContext,
  patch: { xeroEnabled?: boolean; bcEnabled?: boolean; hiddenCompanies?: string[] }
): Promise<void> {
  assertCanManageSettings(auth.user);
  const store = configStoreFor(auth);
  const settings = await store.getSettings();
  if (patch.xeroEnabled !== undefined) settings.xero.enabled = patch.xeroEnabled;
  if (patch.bcEnabled !== undefined) settings.businessCentral.enabled = patch.bcEnabled;
  if (patch.hiddenCompanies) settings.businessCentral.hiddenCompanies = patch.hiddenCompanies;
  await store.saveSettings(settings);
  forgetBcDiscovery(auth);
}

/** Settings › Bookie's emails: his address and the accounts mailbox. Members only; blank clears. */
export async function updateEmailSettings(auth: AuthContext, email: EmailSettings): Promise<void> {
  assertCanManageSettings(auth.user);
  const store = configStoreFor(auth);
  const settings = await store.getSettings();
  settings.email = {
    ...(email.agentAddress ? { agentAddress: email.agentAddress } : {}),
    sharedMailboxes: email.sharedMailboxes ?? [],
  };
  await store.saveSettings(settings);
}

/**
 * Settings › People and access. Members only, so a guest can never widen their
 * own access. Changes take effect on the next request (listOrgs re-reads them).
 *
 * - `upsert` inserts or replaces an entry (people picked from the directory).
 * - `grant` changes the organisations of an entry that already exists.
 * - `remove` deletes an entry.
 */
export async function updateAccessSettings(
  auth: AuthContext,
  change:
    | { type: 'upsert'; person: AccessPerson }
    | { type: 'grant'; who: AccessIdentity; orgKeys: AccessPerson['orgKeys'] }
    | { type: 'remove'; who: AccessIdentity }
    | { type: 'membersSeeAll'; value: boolean }
): Promise<void> {
  assertCanManageSettings(auth.user);
  const store = configStoreFor(auth);
  const settings = await store.getSettings();
  switch (change.type) {
    case 'upsert':
      settings.access = upsertAccessPerson(settings.access, change.person);
      break;
    case 'grant': {
      const index = accessEntryIndex(settings.access, change.who);
      if (index === -1)
        throw new AccessChangeError(
          'That person isn’t listed any more. Refresh the page and add them again.'
        );
      const people = [...settings.access.people];
      people[index] = { ...people[index], orgKeys: change.orgKeys };
      settings.access = { ...settings.access, people };
      break;
    }
    case 'remove':
      settings.access = removeAccessPerson(settings.access, change.who);
      break;
    case 'membersSeeAll':
      settings.access = { ...settings.access, membersSeeAll: change.value };
      break;
  }
  await store.saveSettings(settings);
}

/** People and access: search the tenant's directory as the signed-in member. Members only. */
export async function searchPeople(auth: AuthContext, query: string): Promise<DirectoryPerson[]> {
  assertCanManageSettings(auth.user);
  return searchDirectory(auth, query);
}

/**
 * Add someone picked from the directory. Bookie looks them up again by Entra
 * object id, so only people who are really in the directory can be added, with
 * the name and email the directory gives. An existing entry for them (by id,
 * or an older email-only one) keeps its organisations and gains the id.
 */
export async function addAccessPersonFromDirectory(
  auth: AuthContext,
  userId: string
): Promise<DirectoryPerson> {
  assertCanManageSettings(auth.user);
  const person = await getDirectoryPerson(auth, userId);
  if (!person) throw new AccessChangeError('That person isn’t in your Microsoft 365 directory.');
  const settings = await configStoreFor(auth).getSettings();
  const index = accessEntryIndex(settings.access, { userId: person.id, email: person.email });
  await updateAccessSettings(auth, {
    type: 'upsert',
    person: {
      userId: person.id,
      email: person.email,
      name: person.name,
      orgKeys: index === -1 ? [] : settings.access.people[index].orgKeys,
    },
  });
  return person;
}
