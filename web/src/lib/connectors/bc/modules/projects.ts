import type { BcClient } from '../client';
import type { ProjectsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcProjects(client: BcClient, lcy: () => Promise<string>): ProjectsModule | undefined {
  void client;
  return undefined;
}
