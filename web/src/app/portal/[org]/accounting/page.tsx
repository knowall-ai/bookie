import { redirect } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';

/** The Accounting tab opens on Bank accounts, as in Xero. */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { base } = await orgContext(org);
  redirect(`${base}/accounting/bank`);
}
