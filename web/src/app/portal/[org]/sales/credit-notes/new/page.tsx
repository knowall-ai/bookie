import { CreditNoteEditorPage } from '@/components/sales/CreditNoteEditorPage';

export const metadata = { title: 'New credit note' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return <CreditNoteEditorPage orgParam={org} type="sales" />;
}
