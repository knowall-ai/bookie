import { orgContext } from '@/lib/portal/context';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function Home({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { org } = await orgContext(orgParam);
  return <PageHeader title={org.name} meta={org.sourceLabel} />;
}
