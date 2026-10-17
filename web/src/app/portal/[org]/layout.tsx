import { getAuthContext } from '@/lib/auth/context';
import { orgContext } from '@/lib/portal/context';
import { TopBar } from '@/components/portal/TopBar';

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: orgParam } = await params;
  const { org, orgs, modules } = await orgContext(orgParam);
  const auth = (await getAuthContext())!;
  return (
    <>
      <TopBar
        org={org}
        orgs={orgs}
        modules={modules}
        user={auth.user}
        devMode={auth.mode === 'entra' ? undefined : auth.mode}
      />
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </>
  );
}
