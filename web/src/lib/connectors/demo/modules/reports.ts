import type { DemoData } from '../data';
import type { ReportsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoReports(data: DemoData): ReportsModule | undefined {
  void data;
  return undefined;
}
