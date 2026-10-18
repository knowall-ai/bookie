import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import type { AccountingConnector } from '@/lib/connectors/types';
import type { OrgRef } from '@/lib/domain/types';
import { loadPlannedItems } from '@/lib/forecast/planned';
import { reconcileAllWallets } from '@/lib/bitcoin/reconcile-service';
import { sourceName } from '@/lib/portal/context';
import type { ToolContext } from './tools';

/** Read-only extras Bookie's tools need for the open org (planned forecast items, Bitcoin wallets). */
export function bookieToolContext(
  auth: AuthContext,
  org: OrgRef | undefined,
  connector?: AccountingConnector
): ToolContext {
  if (!org) return {};
  return {
    plannedItems: () => loadPlannedItems(auth, org.key),
    sourceName: sourceName(org),
    bitcoinReconcile: connector
      ? (only) => reconcileAllWallets(auth, { org, connector }, only)
      : undefined,
  };
}
