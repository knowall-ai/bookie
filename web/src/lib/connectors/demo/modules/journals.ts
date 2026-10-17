import type { DemoData } from '../data';
import type { JournalsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoJournals(data: DemoData): JournalsModule | undefined {
  void data;
  return undefined;
}
