import { orgContext } from '@/lib/portal/context';
import { activityRange } from '@/lib/domain/activity';
import { describeError } from '@/lib/portal/actions/util';
import { ErrorPanel } from '@/components/ui/States';
import { ActivityChart } from './ActivityChart';

/**
 * The Home activity heatmap. Render inside <Suspense> so the source system's
 * list calls never hold up the rest of the dashboard. Renders nothing when the
 * back end has no activity feed.
 */
export async function OrgActivity({ orgParam }: { orgParam: string }) {
  const { connector, base } = await orgContext(orgParam);
  if (!connector.activity) return null;
  const { from, to } = activityRange(new Date().toISOString().slice(0, 10));
  let days;
  try {
    days = await connector.activity(from, to);
  } catch (error) {
    return <ErrorPanel title="Activity couldn't be loaded" message={describeError(error)} />;
  }
  return <ActivityChart days={days} base={base} />;
}
