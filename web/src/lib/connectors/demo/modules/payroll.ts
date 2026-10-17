import type { DemoData } from '../data';
import type { PayrollModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoPayroll(data: DemoData): PayrollModule | undefined {
  void data;
  return undefined;
}
