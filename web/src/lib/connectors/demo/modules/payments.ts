import type { DemoData } from '../data';
import type { PaymentsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoPayments(data: DemoData): PaymentsModule | undefined {
  void data;
  return undefined;
}
