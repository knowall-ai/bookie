import { describe, expect, it } from 'vitest';
import { contactTab } from './ContactTabs';
import { addressLines, initials } from './ContactParts';

describe('contacts UI helpers', () => {
  it('picks the tab from ?role= and ?status=', () => {
    expect(contactTab({})).toBe('all');
    expect(contactTab({ role: 'customer' })).toBe('customers');
    expect(contactTab({ role: 'supplier' })).toBe('suppliers');
    expect(contactTab({ role: 'customer', status: 'archived' })).toBe('archived');
    expect(contactTab({ role: 'nonsense' })).toBe('all');
  });

  it('formats addresses and initials', () => {
    expect(
      addressLines({ line1: '1 Market St', line2: ' ', city: 'Leeds', postalCode: 'LS1 1AA' })
    ).toEqual(['1 Market St', 'Leeds, LS1 1AA']);
    expect(addressLines(undefined)).toEqual([]);
    expect(initials('Contoso Coffee Roasters')).toBe('CC');
    expect(initials('fabrikam')).toBe('FA');
    expect(initials('(Northwind) & Co')).toBe('NC');
  });
});
