import type { BcClient } from '../client';
import type { ItemsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcItems(client: BcClient): ItemsModule | undefined {
  void client;
  return undefined;
}
