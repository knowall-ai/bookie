import type { XeroClient } from '../client';
import type { PayrollModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroPayroll(client: XeroClient): PayrollModule | undefined {
  void client;
  return undefined;
}
