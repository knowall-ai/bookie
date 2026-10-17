import type { XeroClient } from '../client';
import type { BankModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroBank(client: XeroClient): BankModule | undefined {
  void client;
  return undefined;
}
