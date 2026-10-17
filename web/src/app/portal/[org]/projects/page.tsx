import {
  ProjectsListPage,
  type ProjectsSearchParams,
} from '@/components/projects/ProjectsListPage';

export const metadata = { title: 'Projects' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<ProjectsSearchParams>;
}) {
  const [{ org }, query] = await Promise.all([params, searchParams]);
  return <ProjectsListPage orgParam={org} searchParams={query} />;
}
