import { requireAuth } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/portal');
  return <div className="bg-night min-h-dvh">{children}</div>;
}
