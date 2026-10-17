import { PurchaseOrderEditorPage } from '@/components/sales/PurchaseOrderPages';

export const metadata = { title: 'Edit purchase order' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <PurchaseOrderEditorPage orgParam={org} id={id} />;
}
