import { AccountsInboxItemPage } from '@/components/accounts-inbox/AccountsInboxItemPage';

export const metadata = { title: 'Accounts inbox' };

export default async function Page({
  params,
}: {
  params: Promise<{ org: string; messageId: string; attachmentId: string }>;
}) {
  const { org, messageId, attachmentId } = await params;
  return <AccountsInboxItemPage orgParam={org} messageId={messageId} attachmentId={attachmentId} />;
}
