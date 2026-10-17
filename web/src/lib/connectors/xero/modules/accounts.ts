import type { XeroClient } from '../client';
import type { AccountsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroAccounts(client: XeroClient): AccountsModule | undefined {
  void client;
  return undefined;
}
