import { describe, expect, it } from 'vitest';
import { fromXeroProject } from './projects';

describe('xero project mapper', () => {
  const contacts = new Map([['c1', { id: 'c1', name: 'Fabrikam Hotels' }]]);

  it('maps totals, contact and deadline', () => {
    const p = fromXeroProject(
      {
        projectId: 'pr1',
        contactId: 'c1',
        name: 'Rollout',
        currencyCode: 'GBP',
        minutesLogged: 125,
        totalInvoiced: { currency: 'GBP', value: 7200 },
        totalToBeInvoiced: { currency: 'GBP', value: 2400 },
        totalExpenseAmount: { currency: 'GBP', value: 640.5 },
        estimate: { currency: 'GBP', value: 18000 },
        deadlineUtc: '2026-12-18T00:00:00Z',
        status: 'INPROGRESS',
      },
      contacts
    );
    expect(p).toEqual({
      id: 'pr1',
      name: 'Rollout',
      contact: { id: 'c1', name: 'Fabrikam Hotels' },
      status: 'in-progress',
      deadline: '2026-12-18',
      currency: 'GBP',
      estimate: 18000,
      totalInvoiced: 7200,
      totalToInvoice: 2400,
      totalExpenses: 640.5,
      minutesLogged: 125,
    });
  });

  it('maps closed projects and unknown contacts', () => {
    const p = fromXeroProject(
      { projectId: 'pr2', contactId: 'zz', name: 'Old', status: 'CLOSED' },
      contacts
    );
    expect(p.status).toBe('closed');
    expect(p.contact).toBeUndefined();
    expect(p.totalInvoiced).toBeUndefined();
  });
});
