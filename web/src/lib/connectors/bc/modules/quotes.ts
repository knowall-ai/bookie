import type { BcClient } from '../client';
import type { QuotesModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcQuotes(client: BcClient, lcy: () => Promise<string>): QuotesModule | undefined {
  void client;
  return undefined;
}
