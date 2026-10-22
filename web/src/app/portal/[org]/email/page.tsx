import { EmailsView } from '@/components/email/EmailsView';
import { orgContext } from '@/lib/portal/context';

export const metadata = { title: 'Email' };

export default async function EmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { org } = await params;
  const [{ base }, { status }] = await Promise.all([orgContext(org), searchParams]);
  return <EmailsView basePath={`${base}/email`} status={status} />;
}
