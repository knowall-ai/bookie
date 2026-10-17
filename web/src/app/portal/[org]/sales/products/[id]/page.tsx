import { ProductDetailPage } from '@/components/sales/ProductPages';

export const metadata = { title: 'Item' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <ProductDetailPage orgParam={org} id={id} />;
}
