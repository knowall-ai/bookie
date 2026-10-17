import { CreditNoteEditorPage } from '@/components/sales/CreditNoteEditorPage';

export const metadata = { title: 'Edit credit note' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <CreditNoteEditorPage orgParam={org} type="sales" id={id} />;
}
