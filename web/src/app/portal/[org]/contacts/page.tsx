import { ContactListPage, type ContactSearchParams } from '@/components/contacts/ContactListPage';

export const metadata = { title: 'Contacts' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<ContactSearchParams>;
}) {
  const [{ org }, query] = await Promise.all([params, searchParams]);
  return <ContactListPage orgParam={org} searchParams={query} />;
}
