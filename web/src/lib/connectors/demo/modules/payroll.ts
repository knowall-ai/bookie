import type { Employee, PayRun } from '@/lib/domain/types';
import type { DemoData } from '../data';
import { DEMO_TODAY } from '../data';
import { matches, paginate } from '../index';
import type { PayrollModule } from '../../types';

/** Six fictional Contoso employees (all names invented). */
const EMPLOYEES: Employee[] = [
  {
    id: 'emp-1',
    firstName: 'Ada',
    lastName: 'Fairweather',
    email: 'ada.fairweather@contoso.example',
    jobTitle: 'Head Roaster',
    startDate: '2019-03-04',
    status: 'active',
  },
  {
    id: 'emp-2',
    firstName: 'Bram',
    lastName: 'Okafor',
    email: 'bram.okafor@contoso.example',
    jobTitle: 'Operations Manager',
    startDate: '2020-09-14',
    status: 'active',
  },
  {
    id: 'emp-3',
    firstName: 'Clara',
    lastName: 'Lindqvist',
    email: 'clara.lindqvist@contoso.example',
    jobTitle: 'Accounts Assistant',
    startDate: '2022-01-10',
    status: 'active',
  },
  {
    id: 'emp-4',
    firstName: 'Dev',
    lastName: 'Ramanathan',
    email: 'dev.ramanathan@contoso.example',
    jobTitle: 'Barista Trainer',
    startDate: '2022-06-20',
    status: 'active',
  },
  {
    id: 'emp-5',
    firstName: 'Esme',
    lastName: 'Whitcombe',
    email: 'esme.whitcombe@contoso.example',
    jobTitle: 'Dispatch Coordinator',
    startDate: '2023-04-03',
    status: 'active',
  },
  {
    id: 'emp-6',
    firstName: 'Felix',
    lastName: 'Marchetti',
    jobTitle: 'Packing Operative',
    startDate: '2021-02-01',
    status: 'terminated',
  },
];

function monthEnd(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}

/** Six monthly pay runs ending with the most recent month end; the latest is still a draft. */
function buildPayRuns(): PayRun[] {
  const now = new Date(`${DEMO_TODAY()}T00:00:00Z`);
  return Array.from({ length: 6 }, (_, i) => {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = monthEnd(first.getUTCFullYear(), first.getUTCMonth());
    const employeeCount = i === 5 ? 6 : 5;
    const totalPay = 11_240 + (5 - i) * 85 + (employeeCount === 6 ? 1_480 : 0);
    return {
      id: `payrun-${first.toISOString().slice(0, 7)}`,
      periodStart: first.toISOString().slice(0, 10),
      periodEnd: end,
      paymentDate: end,
      status: i === 0 ? ('draft' as const) : ('posted' as const),
      employeeCount,
      totalPay: Math.round(totalPay * 100) / 100,
      totalCost: Math.round(totalPay * 1.138 * 100) / 100,
      calendarName: 'Monthly',
    };
  });
}

export function demoPayroll(data: DemoData): PayrollModule | undefined {
  void data;
  return {
    async employees(query) {
      const rows = EMPLOYEES.filter((e) =>
        matches([e.firstName, e.lastName, e.email, e.jobTitle], query?.search)
      );
      return paginate(rows, query);
    },
    async payRuns(query) {
      return paginate(buildPayRuns(), query);
    },
  };
}
