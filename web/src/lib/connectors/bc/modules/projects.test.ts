import { describe, expect, it } from 'vitest';
import { fromBcProject } from './projects';

describe('bc project mapper', () => {
  it('maps a project without financials, and its status as unknown (BC has none)', () => {
    const p = fromBcProject(
      {
        id: 'j1',
        number: 'PR00010',
        displayName: 'Warehouse move',
        billToCustomerNumber: '10000',
        billToName: 'Contoso Ltd',
        endingDate: '2026-11-30',
      },
      'GBP'
    );
    expect(p).toEqual({
      id: 'j1',
      name: 'Warehouse move',
      contact: { id: '10000', name: 'Contoso Ltd' },
      status: 'unknown',
      deadline: '2026-11-30',
      currency: 'GBP',
    });
    expect(p.estimate).toBeUndefined();
    expect(p.totalInvoiced).toBeUndefined();
  });

  it('never calls a project in progress, falls back to the number, and keeps unknown currency unset', () => {
    const p = fromBcProject({ id: 'j2', number: 'PR00011', endingDate: '0001-01-01' }, '');
    expect(p.status).toBe('unknown');
    expect(p.name).toBe('PR00011');
    expect(p.deadline).toBeUndefined();
    expect(p.currency).toBeUndefined();
  });
});
