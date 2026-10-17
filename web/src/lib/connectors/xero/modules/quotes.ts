import type { XeroClient } from '../client';
import type { QuotesModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroQuotes(client: XeroClient, shortCode?: string): QuotesModule | undefined {
  void client;
  return undefined;
}
