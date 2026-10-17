import { ContactEditorPage } from '@/components/contacts/ContactEditorPage';

export const metadata = { title: 'Edit contact' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <ContactEditorPage orgParam={org} id={id} />;
}
