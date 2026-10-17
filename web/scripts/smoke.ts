/**
 * Live smoke test against real back ends using the Azure CLI identity and the
 * local Xero Custom Connection keys. Prints shapes and counts, never amounts,
 * so the output is safe to paste into a PR.
 *
 *   SMOKE_TENANT_ID=<entra tenant> SMOKE_BC_COMPANIES="Production:<companyId>,..." \
 *     bun --conditions=react-server scripts/smoke.ts
 *
 * Xero keys are read from ~/.config/xero/credentials (XERO_CLIENT_ID / XERO_CLIENT_SECRET).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { BcClient } from '../src/lib/connectors/bc/client';
import { createBcConnector } from '../src/lib/connectors/bc';
import { XeroClient, discoverXeroTenants } from '../src/lib/connectors/xero/client';
import { createXeroConnector } from '../src/lib/connectors/xero';
import type { AccountingConnector } from '../src/lib/connectors/types';
import type { XeroConnection } from '../src/lib/config/types';

const cli = (resource: string) =>
  execFileSync('az', [
    'account',
    'get-access-token',
    '--resource',
    resource,
    '--query',
    'accessToken',
    '-o',
    'tsv',
  ])
    .toString()
    .trim();

async function exercise(label: string, connector: AccountingConnector) {
  const started = Date.now();
  const org = await connector.organisation();
  const dash = await connector.dashboard();
  const sales = await connector.invoices!.list('sales', { pageSize: 10 });
  const first = sales.items[0] ? await connector.invoices!.get(sales.items[0].id) : undefined;
  const contacts = await connector.contacts!.list({ pageSize: 10 });
  console.log(`\n== ${label}`);
  console.log(`org: ${org.name} (${org.baseCurrency}, ${org.country ?? '?'})`);
  console.log(
    `dashboard: ${dash.bankAccounts.length} bank accts, trend ${dash.trend.length} months, AR awaiting ${dash.receivables.awaitingPayment.count}, overdue ${dash.receivables.overdue.count}, AP awaiting ${dash.payables.awaitingPayment.count}`
  );
  console.log(
    `sales invoices page: ${sales.items.length} (hasMore ${sales.hasMore}); first has ${first?.lineItems?.length ?? 0} lines, status ${first?.status}, link ${first?.sourceUrl ? 'yes' : 'no'}`
  );
  console.log(`contacts page: ${contacts.items.length}`);
  console.log(`took ${Date.now() - started}ms`);
}

const tenantId = process.env.SMOKE_TENANT_ID;
if (!tenantId) throw new Error('Set SMOKE_TENANT_ID.');

const bcToken = cli('https://api.businesscentral.dynamics.com');
for (const entry of (process.env.SMOKE_BC_COMPANIES ?? '').split(',').filter(Boolean)) {
  const [environment, companyId] = entry.split(':');
  const client = new BcClient({ tenantId, environment, companyId, token: async () => bcToken });
  const name = `${environment}/${companyId.slice(0, 8)}`;
  await exercise(
    `BC ${name}`,
    createBcConnector({
      org: { key: 'x', kind: 'business-central', name, sourceLabel: 'BC' },
      client,
      companyName: name,
    })
  );
}

const creds = Object.fromEntries(
  readFileSync(`${homedir()}/.config/xero/credentials`, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim().replace(/^"|"$/g, '')) as [string, string])
);
const connection: XeroConnection = {
  id: 'smoke',
  kind: 'xero',
  label: 'smoke',
  auth: {
    type: 'custom-connection',
    clientId: creds.XERO_CLIENT_ID,
    clientSecret: creds.XERO_CLIENT_SECRET,
  },
  orgs: [],
  createdBy: 'smoke',
  createdAt: '',
  updatedAt: '',
};
const [tenant] = await discoverXeroTenants(connection, tenantId);
const client = new XeroClient({
  ownerTenantId: tenantId,
  connection,
  xeroTenantId: tenant.tenantId,
});
await exercise(
  `Xero ${tenant.tenantName}`,
  createXeroConnector({
    org: { key: 'x', kind: 'xero', name: tenant.tenantName, sourceLabel: 'Xero' },
    client,
  })
);
