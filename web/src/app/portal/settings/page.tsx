import { ShieldCheck } from 'lucide-react';
import { requireAuth } from '@/lib/auth/context';
import { listOrgs } from '@/lib/connectors/registry';
import { xeroOAuthConfigured } from '@/lib/connectors/xero/oauth';
import { TopBar } from '@/components/portal/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { ConnectorCard } from '@/components/settings/ConnectorCard';
import { XeroConnections, type ConnectionSummary } from '@/components/settings/XeroConnections';
import { BcCompanies } from '@/components/settings/BcCompanies';
import { XeroStatusToast } from '@/components/settings/XeroStatusToast';

export const metadata = { title: 'Settings' };

function XeroMark() {
  return (
    <span
      className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#13b5ea] text-lg font-black text-white"
      aria-hidden="true"
    >
      x
    </span>
  );
}

function BcMark() {
  return (
    <span
      className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0f9a8e] text-sm font-black text-white"
      aria-hidden="true"
    >
      BC
    </span>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ xero?: string }>;
}) {
  const auth = await requireAuth('/portal/settings');
  const { xero: xeroStatus } = await searchParams;
  const { orgs, hiddenBcOrgs, store } = await listOrgs(auth);
  const [settings, connections] = await Promise.all([store.getSettings(), store.listConnections()]);

  const xeroConnections: ConnectionSummary[] = connections.map((c) => ({
    id: c.id,
    label: c.label,
    type: c.auth.type,
    orgs: c.orgs.map((o) => ({ name: o.name, country: o.country, baseCurrency: o.baseCurrency })),
    createdBy: c.createdBy,
    createdAt: c.createdAt,
  }));
  const bcCompanies = [...orgs.filter((o) => o.kind === 'business-central'), ...hiddenBcOrgs]
    .map((o) => ({
      key: o.key,
      name: o.name,
      environment: o.environment ?? '',
      hidden: hiddenBcOrgs.some((h) => h.key === o.key),
    }))
    .sort((a, b) => a.environment.localeCompare(b.environment) || a.name.localeCompare(b.name));

  return (
    <>
      <TopBar
        orgs={orgs}
        user={auth.user}
        devMode={auth.mode === 'entra' ? undefined : auth.mode}
      />
      <XeroStatusToast status={xeroStatus} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <PageHeader
          title="Settings"
          crumbs={[{ label: 'My organisations', href: '/portal' }]}
          meta="Choose which accounting systems Bookie uses for your organisation, and connect them."
        />

        <ConnectorCard
          name="Xero"
          logo={<XeroMark />}
          setting="xeroEnabled"
          enabled={settings.xero.enabled}
          description="Connect one or many Xero organisations. Accountants: connect each client and switch between them from the top-left."
        >
          <XeroConnections connections={xeroConnections} oauthConfigured={xeroOAuthConfigured()} />
        </ConnectorCard>

        <ConnectorCard
          name="Business Central"
          logo={<BcMark />}
          setting="bcEnabled"
          enabled={settings.businessCentral.enabled}
          description="Microsoft Dynamics 365 Business Central, read and written as you, with your own permissions."
        >
          <BcCompanies companies={bcCompanies} />
        </ConnectorCard>

        <section className="card p-5" aria-labelledby="data-title">
          <div className="flex items-start gap-4">
            <span className="bg-brand/10 text-brand-bright flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 text-sm">
              <h2 id="data-title" className="text-ink text-lg font-semibold">
                Where your settings live
              </h2>
              <p className="text-muted mt-1">
                Bookie never stores your accounts. It reads Xero and Business Central live when you
                open a page. The only things it keeps are these connection settings, encrypted with
                a key unique to your organisation and stored in your own Microsoft 365:
              </p>
              <p className="bg-surface-2 text-body mt-3 rounded-lg px-3 py-2 font-mono text-xs break-all">
                {store.location}
              </p>
              <p className="text-faint mt-3 text-xs">Microsoft 365 tenant: {auth.user.tenantId}</p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
