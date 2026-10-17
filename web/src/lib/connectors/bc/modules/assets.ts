import type { BcClient } from '../client';
import type { AssetsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcAssets(client: BcClient): AssetsModule | undefined {
  void client;
  return undefined;
}
