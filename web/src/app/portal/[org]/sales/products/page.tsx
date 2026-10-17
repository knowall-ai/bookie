import { ProductListPage } from '@/components/sales/ProductPages';

export const metadata = { title: 'Products and services' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const [{ org }, query] = await Promise.all([params, searchParams]);
  return <ProductListPage orgParam={org} searchParams={query} />;
}
