import { OverviewPage } from '@/components/sales/OverviewPage';

export const metadata = { title: 'Sales overview' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <OverviewPage orgParam={org} type="sales" />;
}
