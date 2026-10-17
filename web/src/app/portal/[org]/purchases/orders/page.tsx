import { PurchaseOrderListPage } from '@/components/sales/PurchaseOrderPages';
import type { ListSearchParams } from '@/components/documents/InvoiceListPage';

export const metadata = { title: 'Purchase orders' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<ListSearchParams>;
}) {
  const [{ org }, query] = await Promise.all([params, searchParams]);
  return <PurchaseOrderListPage orgParam={org} searchParams={query} />;
}
