import { CreditNoteDetailPage } from '@/components/sales/CreditNotePages';

export const metadata = { title: 'Supplier credit note' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<{ allocate?: string }>;
}) {
  const [{ org, id }, query] = await Promise.all([params, searchParams]);
  return (
    <CreditNoteDetailPage orgParam={org} id={id} type="purchase" allocateTo={query.allocate} />
  );
}
