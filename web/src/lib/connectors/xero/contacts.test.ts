import { describe, expect, it } from 'vitest';
import { fromXeroContact, keepOtherXeroEntries, toXeroContact, type XeroContact } from './mappers';
import { xeroContactsQuery } from './index';

/** Shaped like a GET Contacts row (summaryOnly=false); fictional values. */
const row: XeroContact = {
  ContactID: '00000000-0000-4000-8000-000000000001',
  ContactStatus: 'ACTIVE',
  Name: 'Fabrikam Coffee House',
  FirstName: 'Ava',
  LastName: '',
  EmailAddress: 'accounts@fabrikam.example.com',
  Website: 'https://www.fabrikam.example.com',
  AccountNumber: 'FAB-01',
  TaxNumber: 'GB 999 9999 73',
  DefaultCurrency: 'EUR',
  IsCustomer: true,
  IsSupplier: false,
  Addresses: [
    { AddressType: 'STREET', AddressLine1: '1 Street Way', City: 'Leeds' },
    {
      AddressType: 'POBOX',
      AddressLine1: 'PO Box 12',
      AddressLine2: '',
      City: 'Manchester',
      Region: '',
      PostalCode: 'M1 1AA',
      Country: 'United Kingdom',
    },
  ],
  Phones: [
    { PhoneType: 'DDI', PhoneNumber: '' },
    { PhoneType: 'MOBILE', PhoneNumber: '07700 900123' },
    { PhoneType: 'DEFAULT', PhoneNumber: '496 0000', PhoneAreaCode: '0161' },
    { PhoneType: 'FAX', PhoneNumber: '496 0001' },
  ],
  Balances: {
    AccountsReceivable: { Outstanding: 1250.5, Overdue: 400 },
    AccountsPayable: { Outstanding: 0, Overdue: 0 },
  },
  UpdatedDateUTC: '/Date(1760313600000+0000)/',
};

describe('xero contacts', () => {
  it('maps a full contact row', () => {
    const c = fromXeroContact(row);
    expect(c).toMatchObject({
      id: row.ContactID,
      name: 'Fabrikam Coffee House',
      firstName: 'Ava',
      email: 'accounts@fabrikam.example.com',
      website: 'https://www.fabrikam.example.com',
      accountNumber: 'FAB-01',
      taxNumber: 'GB 999 9999 73',
      currency: 'EUR',
      isCustomer: true,
      isSupplier: false,
      status: 'active',
      address: { line1: 'PO Box 12', city: 'Manchester', postalCode: 'M1 1AA' },
      balances: { receivable: 1250.5, overdueReceivable: 400, payable: 0, overduePayable: 0 },
    });
    expect(c.lastName).toBeUndefined();
    expect(c.address?.line2).toBeUndefined();
  });

  it('prefers the DEFAULT phone, then mobile', () => {
    expect(fromXeroContact(row).phone).toBe('0161 496 0000');
    const mobileOnly = { ...row, Phones: row.Phones!.filter((p) => p.PhoneType !== 'DEFAULT') };
    expect(fromXeroContact(mobileOnly).phone).toBe('07700 900123');
    expect(fromXeroContact({ ...row, Phones: [] }).phone).toBeUndefined();
  });

  it('treats missing Balances as zero only for full responses', () => {
    const { Balances: _b, ...noBalances } = row;
    expect(fromXeroContact(noBalances).balances).toBeUndefined();
    expect(fromXeroContact(noBalances, true).balances).toEqual({
      receivable: 0,
      payable: 0,
      overdueReceivable: 0,
      overduePayable: 0,
    });
  });

  it('maps archived suppliers with payables', () => {
    const c = fromXeroContact({
      ContactID: 's1',
      Name: 'Northwind Beans',
      ContactStatus: 'ARCHIVED',
      IsSupplier: true,
      Balances: { AccountsPayable: { Outstanding: 90, Overdue: 30 } },
    });
    expect(c).toMatchObject({
      status: 'archived',
      isCustomer: false,
      isSupplier: true,
      balances: { payable: 90, overduePayable: 30, receivable: 0 },
    });
  });

  it('builds a Contacts POST body', () => {
    const body = toXeroContact(
      {
        name: 'Contoso Deli',
        email: 'hello@contoso.example.com',
        phone: '0161 496 0123',
        address: { line1: '2 Market St', city: 'Manchester' },
      },
      'c-1'
    );
    expect(body).toMatchObject({
      ContactID: 'c-1',
      Name: 'Contoso Deli',
      EmailAddress: 'hello@contoso.example.com',
      Phones: [
        {
          PhoneType: 'DEFAULT',
          PhoneNumber: '0161 496 0123',
          PhoneAreaCode: '',
          PhoneCountryCode: '',
        },
      ],
      Addresses: [{ AddressType: 'POBOX', AddressLine1: '2 Market St', City: 'Manchester' }],
    });
    // Xero sets IsCustomer/IsSupplier itself, from transactions.
    expect(body).not.toHaveProperty('IsCustomer');
    expect(toXeroContact({ name: 'X' }).Phones).toBeUndefined();
  });

  it('builds list queries for each tab', () => {
    expect(xeroContactsQuery(undefined, 50)).toMatchObject({
      where: undefined,
      includeArchived: undefined,
      summaryOnly: false,
      order: 'Name ASC',
      page: 1,
      pageSize: 50,
    });
    expect(xeroContactsQuery({ role: 'customer', search: '  fab ' }, 50)).toMatchObject({
      where: 'IsCustomer==true',
      searchTerm: 'fab',
    });
    expect(xeroContactsQuery({ role: 'supplier', page: 3 }, 25)).toMatchObject({
      where: 'IsSupplier==true',
      page: 3,
      pageSize: 25,
    });
    expect(xeroContactsQuery({ status: 'archived' }, 50)).toMatchObject({
      where: 'ContactStatus=="ARCHIVED"',
      includeArchived: true,
    });
    expect(xeroContactsQuery({ search: '   ' }, 50).searchTerm).toBeUndefined();
  });
});

describe('keepOtherXeroEntries', () => {
  it("keeps the contact's other addresses and phones when one is updated", () => {
    const body = toXeroContact({
      name: 'Trey Energy',
      phone: '0117 496 0277',
      address: { line1: 'Unit 7 Riverside Park', city: 'Bristol' },
    });
    const merged = keepOtherXeroEntries(body, {
      Addresses: [
        { AddressType: 'STREET', AddressLine1: '5 Harbour Road' },
        { AddressType: 'POBOX', AddressLine1: 'Old PO box' },
      ],
      Phones: [
        { PhoneType: 'MOBILE', PhoneNumber: '07700 900123' },
        { PhoneType: 'DEFAULT', PhoneNumber: '0117 496 0203' },
      ],
    });
    expect(merged.Addresses).toEqual([
      { AddressType: 'STREET', AddressLine1: '5 Harbour Road' },
      expect.objectContaining({ AddressType: 'POBOX', AddressLine1: 'Unit 7 Riverside Park' }),
    ]);
    expect(merged.Phones).toEqual([
      { PhoneType: 'MOBILE', PhoneNumber: '07700 900123' },
      expect.objectContaining({ PhoneType: 'DEFAULT', PhoneNumber: '0117 496 0277' }),
    ]);
  });

  it('leaves collections alone when the update has none', () => {
    const merged = keepOtherXeroEntries(toXeroContact({ name: 'X', email: 'a@b.example' }), {
      Addresses: [{ AddressType: 'STREET', AddressLine1: '1 Road' }],
    });
    expect(merged.Addresses).toBeUndefined();
  });
});

it('only a single-contact response establishes missing bank details as none on file', () => {
  const contact = { ContactID: 'supplier', Name: 'Fabrikam' };
  expect(fromXeroContact(contact).bankDetails).toBeUndefined();
  expect(fromXeroContact(contact, true).bankDetails).toBeUndefined();
  expect(fromXeroContact(contact, true, true).bankDetails).toBeNull();
  expect(
    fromXeroContact({ ...contact, BankAccountDetails: '  fictional bank  ' }).bankDetails
  ).toBe('fictional bank');
});
