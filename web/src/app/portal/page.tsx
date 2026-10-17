import Link from 'next/link';
import { ArrowRight, Building2, Plus } from 'lucide-react';
import { requireAuth } from '@/lib/auth/context';
import { listOrgs } from '@/lib/connectors/registry';
import { TopBar } from '@/components/portal/TopBar';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';

export const metadata = { title: 'My organisations' };

const SOURCE_STYLE = {
  xero: 'bg-[#13b5ea]/15 text-[#5fd3f5] border-[#13b5ea]/30',
  'business-central': 'bg-[#0f9a8e]/15 text-[#4fd1c5] border-[#0f9a8e]/30',
  demo: 'bg-lime/10 text-lime border-lime/30',
} as const;

export default async function MyOrganisations() {
  const auth = await requireAuth('/portal');
  const { orgs } = await listOrgs(auth);

  return (
    <>
      <TopBar
        orgs={orgs}
        user={auth.user}
        devMode={auth.mode === 'entra' ? undefined : auth.mode}
      />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-brand-bright text-sm font-semibold">
              Welcome back, {auth.user.name.split(' ')[0]}
            </p>
            <h1 className="text-ink mt-1 text-3xl font-bold tracking-tight">My organisations</h1>
            <p className="text-muted mt-1">
              Pick an organisation to open its books. Switch any time from the top-left.
            </p>
          </div>
          <ButtonLink href="/portal/settings" variant="secondary">
            <Plus className="h-4 w-4" /> Add a connection
          </ButtonLink>
        </div>

        {orgs.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="No organisations yet"
            body="Connect a Xero organisation, or turn on Business Central, and your organisations will appear here."
            action={
              <ButtonLink href="/portal/settings" variant="primary">
                Connect your books
              </ButtonLink>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="org-list">
            {orgs.map((org) => (
              <li key={org.key}>
                <Link
                  href={`/portal/${encodeURIComponent(org.key)}`}
                  className="card group hover:border-brand/50 flex items-center gap-4 p-5 transition-colors"
                >
                  <span className="bg-surface-3 text-muted group-hover:text-brand-bright flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate font-semibold">{org.name}</span>
                    <span
                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${SOURCE_STYLE[org.kind]}`}
                    >
                      {org.sourceLabel}
                    </span>
                  </span>
                  <ArrowRight className="text-faint group-hover:text-brand-bright h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
