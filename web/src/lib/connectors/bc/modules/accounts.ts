import type { BcClient } from '../client';
import type { AccountsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcAccounts(client: BcClient): AccountsModule | undefined {
  void client;
  return undefined;
}
