import type { Project } from '@/lib/domain/types';
import type { BcClient } from '../client';
import type { ProjectsModule } from '../../types';

/** Business Central API v2.0 `projects` (jobs), trimmed to what Bookie reads. */
export interface BcProject {
  id: string;
  number?: string;
  displayName?: string;
  billToCustomerNumber?: string;
  billToName?: string;
  endingDate?: string;
}

function bcDay(value?: string): string | undefined {
  return value && !value.startsWith('0001') ? value.slice(0, 10) : undefined;
}

export const BC_PROJECT_STATUS_NOTE =
  "Business Central's projects API doesn't include a project's status or financials, so they show as not available. Open the project in Business Central for those.";

/**
 * BC API v2.0 `projects` carries no status and no totals (checked against live
 * companies), so status is `unknown` and financials stay undefined.
 */
export function fromBcProject(raw: BcProject, lcy: string): Project {
  return {
    id: raw.id,
    name: raw.displayName || raw.number || '',
    contact: raw.billToName
      ? { id: raw.billToCustomerNumber ?? '', name: raw.billToName }
      : undefined,
    status: 'unknown',
    deadline: bcDay(raw.endingDate),
    currency: lcy || undefined,
    estimate: undefined,
    totalInvoiced: undefined,
    totalToInvoice: undefined,
    totalExpenses: undefined,
  };
}

export function bcProjects(
  client: BcClient,
  lcy: () => Promise<string>
): ProjectsModule | undefined {
  return {
    statuses: ['unknown'],
    async list(query) {
      const page = query?.page ?? 1;
      const pageSize = query?.pageSize ?? 50;
      const search = query?.search?.trim().toLowerCase();
      const all = await client.all<BcProject>('projects', { $orderby: 'number' });
      const currency = await lcy();
      const wanted = query?.status ?? 'unknown';
      const filtered = all
        .map((p) => fromBcProject(p, currency))
        .filter((p) => p.status === wanted)
        .filter(
          (p) => !search || `${p.name} ${p.contact?.name ?? ''}`.toLowerCase().includes(search)
        );
      return {
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        hasMore: filtered.length > page * pageSize,
        total: filtered.length,
        note: BC_PROJECT_STATUS_NOTE,
      };
    },
    async get(id) {
      const raw = await client.request<BcProject>(`projects(${id})`);
      return fromBcProject(raw, await lcy());
    },
  };
}
