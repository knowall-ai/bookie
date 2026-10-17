import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  redirect(`/portal/${org}/payroll/employees`);
}
