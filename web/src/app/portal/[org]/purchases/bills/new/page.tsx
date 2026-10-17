import { InvoiceEditorPage } from '@/components/documents/InvoiceEditorPage';

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <InvoiceEditorPage orgParam={org} type="purchase" />;
}
