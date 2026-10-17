import type { DemoData } from '../data';
import type { BankModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoBank(data: DemoData): BankModule | undefined {
  void data;
  return undefined;
}
