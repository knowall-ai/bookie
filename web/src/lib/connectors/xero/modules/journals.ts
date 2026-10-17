import type { XeroClient } from '../client';
import type { JournalsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroJournals(client: XeroClient): JournalsModule | undefined {
  void client;
  return undefined;
}
