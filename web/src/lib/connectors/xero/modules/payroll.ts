import type { Employee, ListQuery, Page, PayRun } from '@/lib/domain/types';
import type { XeroClient } from '../client';
import { xeroDate } from '../client';
import type { PayrollModule } from '../../types';

/** Xero Payroll UK v2 payloads (camelCase), trimmed to what Bookie reads. */
export interface XeroPayrollEmployee {
  employeeID: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  occupation?: string;
  startDate?: string;
  endDate?: string;
}

export interface XeroPayRun {
  payRunID: string;
  periodStartDate?: string;
  periodEndDate?: string;
  paymentDate?: string;
  payRunStatus?: string;
  totalCost?: number;
  totalPay?: number;
  paySlips?: unknown[];
  calendarType?: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  pageCount: number;
  itemCount: number;
}

export function fromXeroEmployee(raw: XeroPayrollEmployee, today: string): Employee {
  const end = xeroDate(raw.endDate);
  return {
    id: raw.employeeID,
    firstName: raw.firstName ?? '',
    lastName: raw.lastName ?? '',
    email: raw.email || undefined,
    jobTitle: raw.occupation || undefined,
    startDate: xeroDate(raw.startDate),
    status: end && end < today ? 'terminated' : 'active',
  };
}

export function fromXeroPayRun(raw: XeroPayRun): PayRun {
  return {
    id: raw.payRunID,
    periodStart: xeroDate(raw.periodStartDate) ?? '',
    periodEnd: xeroDate(raw.periodEndDate) ?? '',
    paymentDate: xeroDate(raw.paymentDate) ?? '',
    status: raw.payRunStatus?.toLowerCase() === 'posted' ? 'posted' : 'draft',
    employeeCount: raw.paySlips?.length,
    totalCost: raw.totalCost,
    totalPay: raw.totalPay,
    calendarName: raw.calendarType || undefined,
  };
}

function pageFrom<T>(items: T[], pagination: Pagination | undefined, query?: ListQuery): Page<T> {
  const page = pagination?.page ?? query?.page ?? 1;
  const pageSize = pagination?.pageSize ?? query?.pageSize ?? 50;
  return {
    items,
    page,
    pageSize,
    hasMore: pagination ? page < pagination.pageCount : items.length >= pageSize,
    total: pagination?.itemCount,
  };
}

/**
 * Xero Payroll UK. Orgs without UK payroll answer 400/403/404; the page turns
 * that into a "payroll isn't set up" empty state rather than an error.
 */
export function xeroPayroll(client: XeroClient): PayrollModule | undefined {
  return {
    async employees(query) {
      const result = await client.request<{
        pagination?: Pagination;
        employees?: XeroPayrollEmployee[];
      }>('Employees', {
        api: 'payrollUk',
        query: { page: query?.page ?? 1, pageSize: query?.pageSize ?? 50 },
      });
      const today = new Date().toISOString().slice(0, 10);
      let items = (result.employees ?? []).map((e) => fromXeroEmployee(e, today));
      if (query?.search) {
        const needle = query.search.toLowerCase();
        items = items.filter((e) =>
          `${e.firstName} ${e.lastName} ${e.email ?? ''} ${e.jobTitle ?? ''}`
            .toLowerCase()
            .includes(needle)
        );
      }
      return pageFrom(items, result.pagination, query);
    },
    async payRuns(query) {
      const result = await client.request<{
        pagination?: Pagination;
        payRuns?: XeroPayRun[];
      }>('PayRuns', {
        api: 'payrollUk',
        query: { page: query?.page ?? 1, pageSize: query?.pageSize ?? 50 },
      });
      const items = (result.payRuns ?? [])
        .map(fromXeroPayRun)
        .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
      return pageFrom(items, result.pagination, query);
    },
  };
}
