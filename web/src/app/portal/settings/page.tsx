import { ExternalLink, ShieldCheck, UserLock } from 'lucide-react';
import { canManageSettings } from '@/lib/auth/access';
import { requireAuth } from '@/lib/auth/context';
import { tenantDisplayName } from '@/lib/auth/tenant-name';
import { listOrgs } from '@/lib/connectors/registry';
import { xeroOAuthConfigured } from '@/lib/connectors/xero/oauth';
import { DEFAULT_SETTINGS } from '@/lib/config/types';
import { EmptyState, ErrorPanel } from '@/components/ui/States';
import { ButtonLink } from '@/components/ui/Button';
import { TopBar } from '@/components/portal/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { ConnectorCard } from '@/components/settings/ConnectorCard';
import { XeroConnections, type ConnectionSummary } from '@/components/settings/XeroConnections';
import { BcCompanies } from '@/components/settings/BcCompanies';
import { XeroStatusToast } from '@/components/settings/XeroStatusToast';
import { BcLiveUpdates } from '@/components/settings/BcLiveUpdates';
import { PeopleAccess } from '@/components/settings/PeopleAccess';
import { EmailSettings } from '@/components/settings/EmailSettings';
import { bcWebhooksConfigured } from '@/lib/webhooks/config';
import { BitcoinWallets } from '@/components/settings/BitcoinWallets';
import { electrumStatus, listWallets, type WalletSummary } from '@/lib/bitcoin/wallets';
import { signInStatuses } from '@/lib/directory/graph';

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
  const orgName = await tenantDisplayName(auth);
  const devMode = auth.mode === 'entra' ? undefined : auth.mode;

  // Guests (such as an external accountant) can't change connections or access.
  if (!canManageSettings(auth.user)) {
    const { orgs } = await listOrgs(auth);
    return (
      <>
        <TopBar orgs={orgs} user={auth.user} devMode={devMode} />
        <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
          <PageHeader title="Settings" crumbs={[{ label: 'My organisations', href: '/portal' }]} />
          <div data-testid="settings-guest">
            <EmptyState
              icon={<UserLock className="h-6 w-6" />}
              title={`Ask an administrator at ${orgName ?? 'the organisation that invited you'} to change connections`}
              body={`You're signed in as a guest, so Bookie's connections and access are managed by ${orgName ?? 'that organisation'}. They choose which organisations you can see.`}
              action={
                <ButtonLink href="/portal" variant="secondary">
                  Back to my organisations
                </ButtonLink>
              }
            />
          </div>
        </main>
      </>
    );
  }

  const { orgs, allOrgs, hiddenBcOrgs, store, storeError } = await listOrgs(auth);
  const [settings, connections, locationUrl, wallets] = storeError
    ? [structuredClone(DEFAULT_SETTINGS), [], undefined, [] as WalletSummary[]]
    : await Promise.all([
        store.getSettings(),
        store.listConnections(),
        store.locationUrl(),
        listWallets(auth),
      ]);

  const xeroConnections: ConnectionSummary[] = connections.map((c) => ({
    id: c.id,
    label: c.label,
    type: c.auth.type,
    orgs: c.orgs.map((o) => ({ name: o.name, country: o.country, baseCurrency: o.baseCurrency })),
    createdBy: c.createdBy,
    createdAt: c.createdAt,
  }));
  const bcCompanies = [...allOrgs.filter((o) => o.kind === 'business-central'), ...hiddenBcOrgs]
    .map((o) => ({
      key: o.key,
      name: o.name,
      environment: o.environment ?? '',
      hidden: hiddenBcOrgs.some((h) => h.key === o.key),
    }))
    .sort((a, b) => a.environment.localeCompare(b.environment) || a.name.localeCompare(b.name));
  // Can each listed person sign in (app assignment)? Not awaited: the hints stream in after the
  // page paints (Suspense in PeopleAccess). Never rejects; people Bookie can't check get no hint.
  const signIn = signInStatuses(
    auth,
    settings.access.people.flatMap((p) => p.userId ?? [])
  );
  const accessOrgs = [...allOrgs, ...hiddenBcOrgs].map((o) => ({
    key: o.key,
    name: o.name,
    sourceLabel: o.sourceLabel,
    hidden: hiddenBcOrgs.some((h) => h.key === o.key),
  }));

  return (
    <>
      <TopBar orgs={orgs} user={auth.user} devMode={devMode} />
      <XeroStatusToast status={xeroStatus} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <PageHeader
          title="Settings"
          crumbs={[{ label: 'My organisations', href: '/portal' }]}
          meta="Choose which accounting systems Bookie uses for your organisation, and connect them."
        />

        {storeError && (
          <ErrorPanel
            title="Bookie couldn't reach your organisation's settings"
            message={`Bookie keeps connection settings in your own SharePoint and couldn't read them: ${storeError}. An administrator may need to install Bookie (getbook.ie/install) so it can use SharePoint. Business Central still works.`}
          />
        )}

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
          {auth.mode !== 'demo' && (
            <BcLiveUpdates
              enabled={!!settings.businessCentral.liveUpdates}
              configured={bcWebhooksConfigured()}
            />
          )}
        </ConnectorCard>

        {!storeError && (
          <BitcoinWallets
            wallets={wallets}
            // Business Central wallets live on the BC bank account, not in Bookie's settings.
            orgs={orgs
              .filter((o) => o.kind !== 'business-central')
              .map((o) => ({ key: o.key, name: o.name, sourceLabel: o.sourceLabel }))}
            electrum={electrumStatus()}
          />
        )}

        {!storeError && (
          <PeopleAccess
            orgName={orgName}
            people={settings.access.people}
            signIn={signIn}
            membersSeeAll={settings.access.membersSeeAll}
            orgs={accessOrgs}
          />
        )}

        {!storeError && <EmailSettings {...settings.email} />}

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
                {locationUrl ? (
                  <a
                    href={locationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="settings-location-link"
                    className="text-brand-bright inline-flex items-center gap-1.5 hover:underline"
                  >
                    {store.location}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">(opens SharePoint in a new tab)</span>
                  </a>
                ) : (
                  store.location
                )}
              </p>
              <p className="text-faint mt-3 text-xs">Microsoft 365 tenant: {auth.user.tenantId}</p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
