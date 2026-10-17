import { InboxPage } from '@/components/attachments/InboxPage';

export const metadata = { title: 'Inbox' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ file?: string }>;
}) {
  const [{ org }, { file }] = await Promise.all([params, searchParams]);
  return <InboxPage orgParam={org} fileId={file} />;
}
