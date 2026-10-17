import { OverviewPage } from '@/components/sales/OverviewPage';

export const metadata = { title: 'Purchases overview' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <OverviewPage orgParam={org} type="purchase" />;
}
