import type { XeroClient } from '../client';
import type { PaymentsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroPayments(client: XeroClient): PaymentsModule | undefined {
  void client;
  return undefined;
}
