import type { XeroClient } from '../client';
import type { ProjectsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroProjects(client: XeroClient): ProjectsModule | undefined {
  void client;
  return undefined;
}
