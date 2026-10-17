import type { XeroClient } from '../client';
import type { ItemsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroItems(client: XeroClient): ItemsModule | undefined {
  void client;
  return undefined;
}
