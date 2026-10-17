import { QuoteEditorPage } from '@/components/sales/QuoteEditorPage';

export const metadata = { title: 'Edit quote' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <QuoteEditorPage orgParam={org} id={id} />;
}
