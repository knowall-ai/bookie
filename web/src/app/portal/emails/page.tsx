import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';
import { listOrgs } from '@/lib/connectors/registry';
import { TopBar } from '@/components/portal/TopBar';
import { EmailsView } from '@/components/email/EmailsView';

export const metadata = { title: 'Email' };

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const auth = await requireAuth('/portal/emails');
  const [{ orgs }, { status }] = await Promise.all([listOrgs(auth), searchParams]);
  if (orgs[0])
    redirect(
      `/portal/${encodeURIComponent(orgs[0].key)}/email${status ? `?${new URLSearchParams({ status })}` : ''}`
    );
  return (
    <>
      <TopBar
        orgs={orgs}
        user={auth.user}
        devMode={auth.mode === 'entra' ? undefined : auth.mode}
      />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <EmailsView basePath="/portal/emails" status={status} />
      </main>
    </>
  );
}
