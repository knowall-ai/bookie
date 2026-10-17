import { PurchaseOrderEditorPage } from '@/components/sales/PurchaseOrderPages';

export const metadata = { title: 'New purchase order' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <PurchaseOrderEditorPage orgParam={org} />;
}
