import type { BcClient } from '../client';
import type { PurchaseOrdersModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcPurchaseOrders(
  client: BcClient,
  lcy: () => Promise<string>
): PurchaseOrdersModule | undefined {
  void client;
  return undefined;
}
