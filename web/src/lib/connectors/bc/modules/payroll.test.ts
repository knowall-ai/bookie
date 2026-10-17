import { describe, expect, it } from 'vitest';
import { fromBcEmployee } from './payroll';

describe('bc employee mapper', () => {
  it('maps an active employee', () => {
    expect(
      fromBcEmployee({
        id: 'b1',
        displayName: 'Bram Example',
        givenName: 'Bram',
        surname: 'Example',
        jobTitle: 'Manager',
        email: 'bram@example.com',
        employmentDate: '2022-05-09',
        status: 'Active',
      })
    ).toEqual({
      id: 'b1',
      firstName: 'Bram',
      lastName: 'Example',
      email: 'bram@example.com',
      jobTitle: 'Manager',
      startDate: '2022-05-09',
      status: 'active',
    });
  });

  it('falls back to the display name and ignores the empty BC date', () => {
    const e = fromBcEmployee({
      id: 'b2',
      displayName: 'Clara Van Example',
      employmentDate: '0001-01-01',
      status: 'Inactive',
      email: '',
    });
    expect(e).toMatchObject({ firstName: 'Clara', lastName: 'Van Example', status: 'terminated' });
    expect(e.startDate).toBeUndefined();
    expect(e.email).toBeUndefined();
  });
});
