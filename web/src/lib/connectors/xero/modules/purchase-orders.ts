import type { XeroClient } from '../client';
import type { PurchaseOrdersModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroPurchaseOrders(client: XeroClient): PurchaseOrdersModule | undefined {
  void client;
  return undefined;
}
