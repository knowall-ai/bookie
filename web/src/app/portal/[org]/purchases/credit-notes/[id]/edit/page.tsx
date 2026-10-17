import { CreditNoteEditorPage } from '@/components/sales/CreditNoteEditorPage';

export const metadata = { title: 'Edit supplier credit note' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <CreditNoteEditorPage orgParam={org} type="purchase" id={id} />;
}
