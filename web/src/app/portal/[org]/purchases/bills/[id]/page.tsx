import { InvoiceDetailPage } from '@/components/documents/InvoiceDetailPage';

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <InvoiceDetailPage orgParam={org} id={id} type="purchase" />;
}
