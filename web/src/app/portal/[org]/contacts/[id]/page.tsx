import { ContactDetailPage } from '@/components/contacts/ContactDetailPage';

export const metadata = { title: 'Contact' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <ContactDetailPage orgParam={org} id={id} />;
}
