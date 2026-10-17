import type { BcClient } from '../client';
import type { PayrollModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcPayroll(client: BcClient): PayrollModule | undefined {
  void client;
  return undefined;
}
