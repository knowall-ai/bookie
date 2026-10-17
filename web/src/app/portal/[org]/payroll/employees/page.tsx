import { EmployeesPage, type EmployeesSearchParams } from '@/components/payroll/EmployeesPage';

export const metadata = { title: 'Employees' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<EmployeesSearchParams>;
}) {
  const [{ org }, query] = await Promise.all([params, searchParams]);
  return <EmployeesPage orgParam={org} searchParams={query} />;
}
