import type { BcClient } from '../client';
import type { PaymentsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcPayments(client: BcClient, lcy: () => Promise<string>): PaymentsModule | undefined {
  void client;
  return undefined;
}
