import { QuoteEditorPage } from '@/components/sales/QuoteEditorPage';

export const metadata = { title: 'New quote' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <QuoteEditorPage orgParam={org} />;
}
