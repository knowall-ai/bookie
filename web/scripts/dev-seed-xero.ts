/**
 * Development helper: store a Xero Custom Connection in the local file config
 * store for the Azure CLI user's tenant, exactly as Settings would.
 *
 *   bun --conditions=react-server scripts/dev-seed-xero.ts [credentials-file]
 *
 * The credentials file holds XERO_CLIENT_ID=... and XERO_CLIENT_SECRET=...
 * (default ~/.config/xero/credentials). Needs BOOKIE_CONFIG_KEY in .env.local.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { FileConfigStore } from '../src/lib/config/stores';
import { discoverXeroTenants, XeroClient } from '../src/lib/connectors/xero/client';
import type { XeroConnection } from '../src/lib/config/types';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] ??= m[2];
}

const file = process.argv[2] ?? `${homedir()}/.config/xero/credentials`;
const creds = Object.fromEntries(
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    })
);
const token = execFileSync('az', ['account', 'get-access-token', '--resource', 'https://graph.microsoft.com', '--query', 'accessToken', '-o', 'tsv']).toString().trim();
const tenantId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).tid as string;

const now = new Date().toISOString();
const connection: XeroConnection = {
  id: randomUUID(),
  kind: 'xero',
  label: 'Custom Connection',
  auth: { type: 'custom-connection', clientId: creds.XERO_CLIENT_ID, clientSecret: creds.XERO_CLIENT_SECRET },
  orgs: [],
  createdBy: 'dev-seed',
  createdAt: now,
  updatedAt: now,
};
const tenants = await discoverXeroTenants(connection, tenantId);
for (const t of tenants) {
  const client = new XeroClient({ ownerTenantId: tenantId, connection, xeroTenantId: t.tenantId });
  const { Organisations: [o] } = await client.request<{ Organisations: { Name: string; BaseCurrency: string; CountryCode: string; ShortCode: string }[] }>('Organisation');
  connection.orgs.push({ xeroTenantId: t.tenantId, name: o.Name, baseCurrency: o.BaseCurrency, country: o.CountryCode, shortCode: o.ShortCode });
}
const store = new FileConfigStore(tenantId);
const existing = (await store.listConnections()).find((c) => c.kind === 'xero' && c.auth.type === 'custom-connection' && c.auth.clientId === creds.XERO_CLIENT_ID);
if (existing) connection.id = existing.id;
await store.saveConnection(connection);
console.log(`Saved Xero connection with ${connection.orgs.length} organisation(s) to ${store.location}`);
