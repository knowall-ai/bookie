import { describe, expect, it } from 'vitest';
import { fromXeroEmployee, fromXeroPayRun } from './payroll';

describe('xero payroll mappers', () => {
  it('maps a current employee', () => {
    const e = fromXeroEmployee(
      {
        employeeID: 'e1',
        firstName: 'Ada',
        lastName: 'Example',
        email: 'ada@example.com',
        occupation: 'Roaster',
        startDate: '2024-02-01T00:00:00',
      },
      '2026-10-17'
    );
    expect(e).toMatchObject({
      id: 'e1',
      firstName: 'Ada',
      jobTitle: 'Roaster',
      startDate: '2024-02-01',
      status: 'active',
    });
  });

  it('marks employees with a past end date as terminated', () => {
    const e = fromXeroEmployee({ employeeID: 'e2', endDate: '2025-12-31T00:00:00' }, '2026-10-17');
    expect(e.status).toBe('terminated');
    expect(e.firstName).toBe('');
  });

  it('maps a posted pay run', () => {
    const run = fromXeroPayRun({
      payRunID: 'p1',
      periodStartDate: '2026-09-01',
      periodEndDate: '2026-09-30',
      paymentDate: '2026-09-30',
      payRunStatus: 'Posted',
      totalCost: 1200.5,
      totalPay: 1000,
      calendarType: 'Monthly',
      paySlips: [{}, {}],
    });
    expect(run).toEqual({
      id: 'p1',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      paymentDate: '2026-09-30',
      status: 'posted',
      employeeCount: 2,
      totalCost: 1200.5,
      totalPay: 1000,
      calendarName: 'Monthly',
    });
  });

  it('treats other statuses as draft', () => {
    expect(fromXeroPayRun({ payRunID: 'p2', payRunStatus: 'Draft' }).status).toBe('draft');
  });
});
