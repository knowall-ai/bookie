import type { DemoData } from '../data';
import type { PurchaseOrdersModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoPurchaseOrders(data: DemoData): PurchaseOrdersModule | undefined {
  void data;
  return undefined;
}
