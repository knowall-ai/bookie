import { describe, expect, it } from 'vitest';
import { fromBcProject } from './projects';

describe('bc project mapper', () => {
  it('maps an open project without financials', () => {
    const p = fromBcProject(
      {
        id: 'j1',
        number: 'PR00010',
        displayName: 'Warehouse move',
        status: 'Open',
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
      status: 'in-progress',
      deadline: '2026-11-30',
      currency: 'GBP',
    });
  });

  it('treats completed projects as closed and falls back to the number', () => {
    const p = fromBcProject(
      { id: 'j2', number: 'PR00011', status: 'Completed', endingDate: '0001-01-01' },
      'EUR'
    );
    expect(p.status).toBe('closed');
    expect(p.name).toBe('PR00011');
    expect(p.deadline).toBeUndefined();
  });
});
