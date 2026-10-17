import { PayRunsPage } from '@/components/payroll/PayRunsPage';

export const metadata = { title: 'Pay runs' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ org }, query] = await Promise.all([params, searchParams]);
  return <PayRunsPage orgParam={org} searchParams={query} />;
}
