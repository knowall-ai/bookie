import { ContactEditorPage } from '@/components/contacts/ContactEditorPage';

export const metadata = { title: 'New contact' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const [{ org }, { role }] = await Promise.all([params, searchParams]);
  return <ContactEditorPage orgParam={org} role={role} />;
}
