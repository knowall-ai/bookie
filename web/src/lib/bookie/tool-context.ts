import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import type { OrgRef } from '@/lib/domain/types';
import { loadPlannedItems } from '@/lib/forecast/planned';
import { sourceName } from '@/lib/portal/context';
import type { ToolContext } from './tools';

/** Read-only extras Bookie's tools need for the open org (its planned forecast items). */
export function bookieToolContext(auth: AuthContext, org: OrgRef | undefined): ToolContext {
  if (!org) return {};
  return {
    plannedItems: () => loadPlannedItems(auth, org.key),
    sourceName: sourceName(org),
  };
}
