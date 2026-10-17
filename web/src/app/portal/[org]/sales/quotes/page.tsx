import { QuoteListPage } from '@/components/sales/QuoteListPage';
import type { ListSearchParams } from '@/components/documents/InvoiceListPage';

export const metadata = { title: 'Quotes' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<ListSearchParams>;
}) {
  const [{ org }, query] = await Promise.all([params, searchParams]);
  return <QuoteListPage orgParam={org} searchParams={query} />;
}
