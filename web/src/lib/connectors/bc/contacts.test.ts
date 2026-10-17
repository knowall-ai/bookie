import { describe, expect, it } from 'vitest';
import {
  fromParty,
  isBlocked,
  matchesPartySearch,
  parseContactId,
  toParty,
  type BcParty,
} from './index';

const GUID = '0f1e2d3c-4b5a-4969-8877-665544332211';

/** Shaped like GET customers / vendors rows from BC API v2.0; fictional values. */
const customer: BcParty = {
  id: GUID,
  number: 'C00010',
  displayName: 'Fabrikam Coffee House',
  email: 'accounts@fabrikam.example.com',
  phoneNumber: '',
  website: '',
  addressLine1: '1 Market Street',
  addressLine2: '',
  city: 'Manchester',
  state: '',
  postalCode: 'M1 1AA',
  country: 'GB',
  taxRegistrationNumber: 'GB999999973',
  currencyCode: '',
  blocked: '_x0020_',
  balanceDue: 1200,
  lastModifiedDateTime: '2026-03-16T16:33:00Z',
};

describe('bc contacts', () => {
  it('parses c:/v: ids and rejects anything that is not a GUID', () => {
    expect(parseContactId(`c:${GUID}`)).toEqual({ entity: 'customers', id: GUID });
    expect(parseContactId(`v:${GUID.toUpperCase()}`)).toEqual({
      entity: 'vendors',
      id: GUID.toUpperCase(),
    });
    expect(() => parseContactId(GUID)).toThrow('Unknown contact id.');
    expect(() => parseContactId(`c:${GUID}) or (1 eq 1`)).toThrow();
    expect(() => parseContactId('c:')).toThrow();
  });

  it('reads the blocked enum', () => {
    expect(isBlocked('_x0020_')).toBe(false);
    expect(isBlocked(' ')).toBe(false);
    expect(isBlocked(undefined)).toBe(false);
    expect(isBlocked('All')).toBe(true);
    expect(isBlocked('Invoice')).toBe(true);
  });

  it('maps a customer, with the financial detail when expanded', () => {
    const c = fromParty(
      { ...customer, customerFinancialDetail: { balance: 1200, overdueAmount: 300 } },
      'customers'
    );
    expect(c).toMatchObject({
      id: `c:${GUID}`,
      name: 'Fabrikam Coffee House',
      accountNumber: 'C00010',
      taxNumber: 'GB999999973',
      isCustomer: true,
      isSupplier: false,
      status: 'active',
      address: { line1: '1 Market Street', city: 'Manchester', postalCode: 'M1 1AA' },
      balances: { receivable: 1200, overdueReceivable: 300 },
    });
    expect(c.phone).toBeUndefined();
    expect(c.currency).toBeUndefined();
    expect(fromParty(customer, 'customers').balances?.overdueReceivable).toBeUndefined();
  });

  it('maps a blocked vendor', () => {
    const { balanceDue: _b, ...rest } = customer;
    const v = fromParty({ ...rest, number: 'V00020', blocked: 'All', balance: 75 }, 'vendors');
    expect(v).toMatchObject({
      id: `v:${GUID}`,
      isCustomer: false,
      isSupplier: true,
      status: 'archived',
      balances: { payable: 75 },
    });
  });

  it('shows no balance for a foreign-currency contact, since BC sums it unconverted', () => {
    const eur = fromParty({ ...customer, currencyCode: 'EUR' }, 'customers', 'GBP');
    expect(eur.balances).toBeUndefined();
    expect(eur.balancesNote).toContain('EUR');
    expect(eur.currency).toBe('EUR');
    const gbp = fromParty({ ...customer, currencyCode: 'GBP' }, 'customers', 'GBP');
    expect(gbp.balances?.receivable).toBe(1200);
    expect(gbp.balancesNote).toBeUndefined();
    const { balanceDue: _b, ...unknown } = customer;
    expect(fromParty(unknown, 'customers', 'GBP').balances?.receivable).toBeUndefined();
  });

  it('searches name, number and email case-insensitively', () => {
    const c = fromParty(customer, 'customers');
    expect(matchesPartySearch(c, undefined)).toBe(true);
    expect(matchesPartySearch(c, '  ')).toBe(true);
    expect(matchesPartySearch(c, 'fabrikam')).toBe(true);
    expect(matchesPartySearch(c, 'c00010')).toBe(true);
    expect(matchesPartySearch(c, 'ACCOUNTS@')).toBe(true);
    expect(matchesPartySearch(c, 'northwind')).toBe(false);
  });

  it('builds a customer/vendor body', () => {
    expect(
      toParty({
        name: 'Contoso Deli',
        email: 'hello@contoso.example.com',
        phone: '0161 496 0123',
        taxNumber: 'GB1',
        address: { line1: '2 Market St', region: 'Greater Manchester', postalCode: 'M2 2BB' },
      })
    ).toMatchObject({
      displayName: 'Contoso Deli',
      email: 'hello@contoso.example.com',
      phoneNumber: '0161 496 0123',
      taxRegistrationNumber: 'GB1',
      addressLine1: '2 Market St',
      state: 'Greater Manchester',
      postalCode: 'M2 2BB',
    });
  });
});
