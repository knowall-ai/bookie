import type { BcClient } from '../client';
import type { JournalsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcJournals(client: BcClient): JournalsModule | undefined {
  void client;
  return undefined;
}
