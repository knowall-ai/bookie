import { ProductEditorPage } from '@/components/sales/ProductPages';

export const metadata = { title: 'New item' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <ProductEditorPage orgParam={org} />;
}
