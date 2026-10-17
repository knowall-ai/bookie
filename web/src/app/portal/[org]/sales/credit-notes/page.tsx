import { CreditNoteListPage } from '@/components/sales/CreditNotePages';
import type { ListSearchParams } from '@/components/documents/InvoiceListPage';

export const metadata = { title: 'Credit notes' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<ListSearchParams>;
}) {
  const [{ org }, query] = await Promise.all([params, searchParams]);
  return <CreditNoteListPage orgParam={org} type="sales" searchParams={query} />;
}
