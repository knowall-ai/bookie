import { PurchaseOrderDetailPage } from '@/components/sales/PurchaseOrderPages';

export const metadata = { title: 'Purchase order' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <PurchaseOrderDetailPage orgParam={org} id={id} />;
}
