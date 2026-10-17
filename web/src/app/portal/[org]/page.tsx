import { Suspense } from 'react';
import { orgContext } from '@/lib/portal/context';
import { PageHeader } from '@/components/ui/PageHeader';
import { OrgActivity } from '@/components/home/OrgActivity';
import { ActivityChartSkeleton } from '@/components/home/ActivityChart';

export default async function Home({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { org, connector } = await orgContext(orgParam);
  return (
    <>
      <PageHeader title={org.name} meta={org.sourceLabel} />
      {connector.activity && (
        <div className="mb-6">
          <Suspense fallback={<ActivityChartSkeleton />}>
            <OrgActivity orgParam={orgParam} />
          </Suspense>
        </div>
      )}
    </>
  );
}
