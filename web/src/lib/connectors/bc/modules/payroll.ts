import type { Employee } from '@/lib/domain/types';
import type { BcClient } from '../client';
import type { PayrollModule } from '../../types';

/** Business Central API v2.0 `employees`, trimmed to what Bookie reads. */
export interface BcEmployee {
  id: string;
  number?: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  jobTitle?: string;
  email?: string;
  employmentDate?: string;
  status?: string;
}

/** BC leaves dates as 0001-01-01 when empty. */
function bcDay(value?: string): string | undefined {
  return value && !value.startsWith('0001') ? value.slice(0, 10) : undefined;
}

export function fromBcEmployee(raw: BcEmployee): Employee {
  const [first = '', ...rest] = (raw.displayName ?? '').split(' ');
  return {
    id: raw.id,
    firstName: raw.givenName || first,
    lastName: raw.surname || rest.join(' '),
    email: raw.email || undefined,
    jobTitle: raw.jobTitle || undefined,
    startDate: bcDay(raw.employmentDate),
    status: raw.status === 'Active' ? 'active' : 'terminated',
  };
}

/**
 * Business Central has an employee list but no payroll: there is no pay run
 * entity in API v2.0, so `payRuns` is always an empty page and the UI says so.
 */
export function bcPayroll(client: BcClient): PayrollModule | undefined {
  return {
    async employees(query) {
      const page = query?.page ?? 1;
      const pageSize = query?.pageSize ?? 50;
      const search = query?.search?.trim().toLowerCase();
      // BC can't $orderby displayName or OR across fields, so sort and search here (small lists).
      const all = await client.all<BcEmployee>('employees', { $orderby: 'number' });
      const rows = all
        .map(fromBcEmployee)
        .filter(
          (e) =>
            !search ||
            `${e.firstName} ${e.lastName} ${e.jobTitle ?? ''} ${e.email ?? ''}`
              .toLowerCase()
              .includes(search)
        );
      return {
        items: rows.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        hasMore: rows.length > page * pageSize,
        total: rows.length,
      };
    },
    async payRuns(query) {
      return { items: [], page: query?.page ?? 1, pageSize: query?.pageSize ?? 50, hasMore: false };
    },
  };
}
