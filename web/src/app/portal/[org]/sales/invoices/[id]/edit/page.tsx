import { InvoiceEditorPage } from '@/components/documents/InvoiceEditorPage';

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <InvoiceEditorPage orgParam={org} id={id} type="sales" />;
}
