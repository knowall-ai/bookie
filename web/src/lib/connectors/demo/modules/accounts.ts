import type { DemoData } from '../data';
import type { AccountsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoAccounts(data: DemoData): AccountsModule | undefined {
  void data;
  return undefined;
}
