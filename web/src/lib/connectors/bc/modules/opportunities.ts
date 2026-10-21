import type { Opportunity } from '@/lib/domain/types';
import type { OpportunitiesModule } from '../../types';
import type { BcClient, ODataList } from '../client';
import { bcDate } from '../index';

export interface BcOpportunity {
  id: string;
  number: string;
  description: string;
  contactCompanyName?: string;
  contactName?: string;
  salespersonCode?: string;
  status: string;
  closed: boolean;
  estimatedValue?: number;
  chancesOfSuccessPrc?: number;
  estimatedClosingDate?: string;
}

const finite = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function fromBcOpportunity(raw: BcOpportunity, lcy: string): Opportunity {
  const statuses: Record<string, Opportunity['status']> = {
    'Not Started': 'not-started',
    'In Progress': 'in-progress',
    Won: 'won',
    Lost: 'lost',
  };
  const chance = finite(raw.chancesOfSuccessPrc);
  const status = raw.status.replaceAll('_x0020_', ' ').trim();
  return {
    id: raw.id,
    number: raw.number,
    description: raw.description,
    contact: raw.contactCompanyName || raw.contactName || undefined,
    salesperson: raw.salespersonCode || undefined,
    status: Object.hasOwn(statuses, status) ? statuses[status] : 'unknown',
    closed: raw.closed,
    estimatedValue: finite(raw.estimatedValue),
    chanceOfSuccess: chance !== undefined && chance >= 0 && chance <= 100 ? chance : undefined,
    estimatedClosingDate: bcDate(raw.estimatedClosingDate),
    // Opportunity values are LCY fields, not contact-currency amounts.
    currency: lcy || undefined,
  };
}

export function bcOpportunities(client: BcClient, lcy: () => Promise<string>): OpportunitiesModule {
  return {
    async list(options) {
      const page = options?.page ?? 1;
      const pageSize = options?.pageSize ?? 50;
      const result = await client.request<ODataList<BcOpportunity>>('opportunities', {
        query: {
          $filter: options?.open ? 'closed eq false' : undefined,
          $orderby: 'number,id',
          $top: pageSize + 1,
          $skip: (page - 1) * pageSize,
        },
      });
      const currency = await lcy();
      return {
        items: result.value.slice(0, pageSize).map((row) => fromBcOpportunity(row, currency)),
        page,
        pageSize,
        hasMore: result.value.length > pageSize,
      };
    },
  };
}
