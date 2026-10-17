import { InboxBillPage } from '@/components/attachments/InboxBillPage';

export const metadata = { title: 'New bill' };

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; fileId: string }>;
}) {
  const { org, fileId } = await params;
  return <InboxBillPage orgParam={org} fileId={fileId} />;
}
