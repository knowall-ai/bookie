import type { BcClient } from '../client';
import type { BankModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcBank(client: BcClient, lcy: () => Promise<string>): BankModule | undefined {
  void client;
  return undefined;
}
