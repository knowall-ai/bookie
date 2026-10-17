import type { PurchaseOrderStatus, PurchaseOrderStatusChange } from './types';

/**
 * Xero's purchase order workflow: Draft → Awaiting approval → Approved →
 * Billed. A draft can be approved directly; anything not yet billed can be
 * deleted.
 */
const NEXT: Record<PurchaseOrderStatus, PurchaseOrderStatusChange[]> = {
  draft: ['submitted', 'authorised', 'deleted'],
  submitted: ['authorised', 'deleted'],
  authorised: ['billed', 'deleted'],
  billed: [],
  deleted: [],
};

/** The status changes open to an order now, limited to what the back end supports. */
export function purchaseOrderStatusChanges(
  current: PurchaseOrderStatus,
  supported: readonly PurchaseOrderStatusChange[] = [],
  deletableStatuses?: readonly PurchaseOrderStatus[]
): PurchaseOrderStatusChange[] {
  return NEXT[current].filter(
    (change) =>
      supported.includes(change) &&
      (change !== 'deleted' || !deletableStatuses || deletableStatuses.includes(current))
  );
}
