import { QuoteDetailPage } from '@/components/sales/QuoteDetailPage';

export const metadata = { title: 'Quote' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <QuoteDetailPage orgParam={org} id={id} />;
}
