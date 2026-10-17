import { InvoiceListPage, type ListSearchParams } from '@/components/documents/InvoiceListPage';

export const metadata = { title: 'Bills' };

export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<ListSearchParams> }) {
  const [{ org }, query] = await Promise.all([params, searchParams]);
  return <InvoiceListPage orgParam={org} type="purchase" searchParams={query} />;
}
