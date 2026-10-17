import { ProjectDetailPage } from '@/components/projects/ProjectDetailPage';

export const metadata = { title: 'Project' };

export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  return <ProjectDetailPage orgParam={org} id={id} />;
}
