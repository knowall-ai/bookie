import { ProductEditorPage } from '@/components/sales/ProductPages';

export const metadata = { title: 'Edit item' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <ProductEditorPage orgParam={org} id={id} />;
}
