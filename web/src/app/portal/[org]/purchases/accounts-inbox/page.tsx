import { AccountsInboxPage } from '@/components/accounts-inbox/AccountsInboxPage';

export const metadata = { title: 'Accounts inbox' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ weeks?: string }>;
}) {
  const [{ org }, { weeks }] = await Promise.all([params, searchParams]);
  return <AccountsInboxPage orgParam={org} weeks={weeks} />;
}
