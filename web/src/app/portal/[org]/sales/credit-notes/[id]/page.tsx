import { CreditNoteDetailPage } from '@/components/sales/CreditNotePages';

export const metadata = { title: 'Credit note' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <CreditNoteDetailPage orgParam={org} id={id} type="sales" />;
}
