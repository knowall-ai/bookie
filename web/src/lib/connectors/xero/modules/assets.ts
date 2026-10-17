import type { XeroClient } from '../client';
import type { AssetsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroAssets(client: XeroClient): AssetsModule | undefined {
  void client;
  return undefined;
}
