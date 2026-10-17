import type { ContactRef, ListQuery, Page, Project } from '@/lib/domain/types';
import type { XeroClient } from '../client';
import { xeroDate } from '../client';
import type { ProjectsModule } from '../../types';

interface Amount {
  currency?: string;
  value?: number;
}

/** Xero Projects API v2 project, trimmed to what Bookie reads. */
export interface XeroProject {
  projectId: string;
  contactId?: string;
  name: string;
  currencyCode?: string;
  minutesLogged?: number;
  totalInvoiced?: Amount;
  totalToBeInvoiced?: Amount;
  totalExpenseAmount?: Amount;
  estimate?: Amount;
  estimateAmount?: number;
  deadlineUtc?: string;
  status?: string;
}

export function fromXeroProject(raw: XeroProject, contacts: Map<string, ContactRef>): Project {
  return {
    id: raw.projectId,
    name: raw.name,
    contact: raw.contactId ? contacts.get(raw.contactId) : undefined,
    status: raw.status?.toUpperCase() === 'CLOSED' ? 'closed' : 'in-progress',
    deadline: xeroDate(raw.deadlineUtc),
    currency: raw.currencyCode,
    estimate: raw.estimate?.value ?? raw.estimateAmount,
    totalInvoiced: raw.totalInvoiced?.value,
    totalToInvoice: raw.totalToBeInvoiced?.value,
    totalExpenses: raw.totalExpenseAmount?.value,
    minutesLogged: raw.minutesLogged,
  };
}

interface Pagination {
  page: number;
  pageSize: number;
  pageCount: number;
  itemCount: number;
}

/** The Projects API only returns contact ids; resolve names with Contacts calls. */
async function contactNames(
  client: XeroClient,
  ids: (string | undefined)[]
): Promise<Map<string, ContactRef>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const map = new Map<string, ContactRef>();
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const result = await client
      .request<{ Contacts?: { ContactID: string; Name: string }[] }>('Contacts', {
        query: { IDs: chunk.join(','), summaryOnly: true },
      })
      .catch(() => undefined);
    for (const c of result?.Contacts ?? []) map.set(c.ContactID, { id: c.ContactID, name: c.Name });
  }
  return map;
}

export function xeroProjects(client: XeroClient): ProjectsModule | undefined {
  return {
    async list(query?: ListQuery & { status?: 'in-progress' | 'closed' }): Promise<Page<Project>> {
      const page = query?.page ?? 1;
      const pageSize = query?.pageSize ?? 50;
      const result = await client.request<{ pagination?: Pagination; items?: XeroProject[] }>(
        'projects',
        {
          api: 'projects',
          query: {
            states: query?.status === 'closed' ? 'CLOSED' : 'INPROGRESS',
            page,
            pageSize,
          },
        }
      );
      const raws = result.items ?? [];
      const contacts = await contactNames(
        client,
        raws.map((p) => p.contactId)
      );
      let items = raws.map((p) => fromXeroProject(p, contacts));
      if (query?.search) {
        const needle = query.search.toLowerCase();
        items = items.filter((p) =>
          `${p.name} ${p.contact?.name ?? ''}`.toLowerCase().includes(needle)
        );
      }
      return {
        items,
        page,
        pageSize,
        hasMore: result.pagination ? page < result.pagination.pageCount : raws.length >= pageSize,
        total: result.pagination?.itemCount,
      };
    },
    async get(id) {
      const raw = await client.request<XeroProject>(`projects/${encodeURIComponent(id)}`, {
        api: 'projects',
      });
      const contacts = await contactNames(client, [raw.contactId]);
      return fromXeroProject(raw, contacts);
    },
  };
}
