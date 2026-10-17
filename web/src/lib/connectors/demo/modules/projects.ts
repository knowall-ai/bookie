import type { DemoData } from '../data';
import type { ProjectsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoProjects(data: DemoData): ProjectsModule | undefined {
  void data;
  return undefined;
}
