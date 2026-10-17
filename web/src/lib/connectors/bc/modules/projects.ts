import type { Project } from '@/lib/domain/types';
import type { BcClient } from '../client';
import type { ProjectsModule } from '../../types';

/** Business Central API v2.0 `projects` (jobs), trimmed to what Bookie reads. */
export interface BcProject {
  id: string;
  number?: string;
  displayName?: string;
  status?: string;
  billToCustomerNumber?: string;
  billToName?: string;
  endingDate?: string;
}

function bcDay(value?: string): string | undefined {
  return value && !value.startsWith('0001') ? value.slice(0, 10) : undefined;
}

/**
 * BC's project entity carries no totals, so financials stay undefined and the
 * UI shows dashes. Completed projects count as closed.
 */
export function fromBcProject(raw: BcProject, lcy: string): Project {
  const closed = raw.status === 'Completed' || raw.status === 'Closed';
  return {
    id: raw.id,
    name: raw.displayName || raw.number || 'Project',
    contact: raw.billToName
      ? { id: raw.billToCustomerNumber ?? '', name: raw.billToName }
      : undefined,
    status: closed ? 'closed' : 'in-progress',
    deadline: bcDay(raw.endingDate),
    currency: lcy,
  };
}

export function bcProjects(
  client: BcClient,
  lcy: () => Promise<string>
): ProjectsModule | undefined {
  return {
    async list(query) {
      const page = query?.page ?? 1;
      const pageSize = query?.pageSize ?? 50;
      const search = query?.search?.trim().toLowerCase();
      // Status is mapped client side: BC's status enum is awkward to filter on.
      const all = await client.all<BcProject>('projects', { $orderby: 'number' });
      const currency = await lcy();
      const wanted = query?.status ?? 'in-progress';
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
      };
    },
    async get(id) {
      const raw = await client.request<BcProject>(`projects(${id})`);
      return fromBcProject(raw, await lcy());
    },
  };
}
