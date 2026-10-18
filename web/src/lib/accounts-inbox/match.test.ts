import { describe, expect, it } from 'vitest';
import type { Contact, Invoice } from '@/lib/domain/types';
import {
  bankCheck,
  findExistingBill,
  matchSupplier,
  normaliseInvoiceNumber,
  normaliseName,
  supplierDiff,
  type SupplierEvidence,
} from './match';
import { newSupplierInput } from './supplier';

const contact = (id: string, patch: Partial<Contact> = {}): Contact => ({
  id,
  name: `Contact ${id}`,
  isCustomer: false,
  isSupplier: true,
  status: 'active',
  ...patch,
});

const ev = (patch: Partial<Record<keyof SupplierEvidence, unknown>>): SupplierEvidence => {
  const out: SupplierEvidence = {};
  for (const [k, v] of Object.entries(patch))
    (out as Record<string, unknown>)[k] = {
      value: v,
      source: k.startsWith('sender') ? 'sender' : 'document',
    };
  return out;
};

describe('matchSupplier precedence', () => {
  const contacts = [
    contact('a', { name: 'Fabrikam Ltd', taxNumber: 'GB 123 4567 89', email: 'x@other.example' }),
    contact('b', { name: 'Fabrikam Ltd', email: 'ap@fabrikam.example' }),
    contact('c', { name: 'Northwind Traders Limited', email: 'hello@gmail.com' }),
  ];

  it('matches on the VAT number first, ignoring spaces and the country prefix', () => {
    const m = matchSupplier(
      ev({ taxNumber: '123456789', senderDomain: 'fabrikam.example', name: 'Fabrikam Ltd' }),
      contacts
    );
    expect(m).toMatchObject({ status: 'matched', by: 'tax-number' });
    expect(m.status === 'matched' && m.contact.id).toBe('a');
    expect(m.reason).toMatch(/VAT number 123456789 \(from the document\) matches Fabrikam Ltd/);
  });

  it('then the sender domain against the contact email domain', () => {
    const m = matchSupplier(
      ev({ senderDomain: 'billing.fabrikam.example', name: 'Fabrikam Ltd' }),
      contacts
    );
    expect(m).toMatchObject({ status: 'matched', by: 'sender-domain' });
    expect(m.status === 'matched' && m.contact.id).toBe('b');
  });

  it('then the exact (normalised) name, and says when several match', () => {
    const one = matchSupplier(ev({ name: 'The Northwind Traders Ltd.' }), contacts);
    expect(one).toMatchObject({ status: 'matched', by: 'name' });
    const several = matchSupplier(ev({ name: 'Fabrikam Limited' }), contacts);
    expect(several).toMatchObject({ status: 'several', by: 'name' });
    expect(several.status === 'several' && several.contacts.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('never matches on a webmail domain', () => {
    const m = matchSupplier(ev({ senderDomain: 'gmail.com' }), contacts);
    expect(m.status).toBe('none');
  });

  it('says plainly when nothing matches, and never fuzzy-matches names', () => {
    expect(matchSupplier(ev({ name: 'Fabrikam Holdings' }), contacts).status).toBe('none');
    expect(matchSupplier({}, contacts).reason).toMatch(/nothing to match/);
  });

  it('ignores archived contacts', () => {
    const m = matchSupplier(ev({ name: 'Old Co' }), [
      contact('z', { name: 'Old Co', status: 'archived' }),
    ]);
    expect(m.status).toBe('none');
  });

  it('normalises names', () => {
    expect(normaliseName('The Contoso Coffee Co. Ltd')).toBe('contoso coffee');
  });
});

const bill = (patch: Partial<Invoice>): Invoice => ({
  id: 'bill-1',
  type: 'purchase',
  number: 'INV-00431',
  contact: { id: 'a', name: 'Fabrikam' },
  date: '2026-10-01',
  status: 'authorised',
  currency: 'GBP',
  subTotal: 100,
  totalTax: 20,
  total: 120,
  isOverdue: false,
  ...patch,
});

describe('findExistingBill', () => {
  const query = {
    supplierId: 'a',
    invoiceNumber: 'inv 431',
    total: 120,
    date: '2026-10-01',
    currency: 'GBP',
  };

  it('matches supplier + invoice number, ignoring case, spaces and leading zeros', () => {
    expect(normaliseInvoiceNumber('inv 00431')).toBe(normaliseInvoiceNumber('INV431'));
    expect(findExistingBill(query, [bill({})])).toMatchObject({ status: 'same', by: 'number' });
  });

  it("matches the bill's reference too (Business Central keeps the supplier's number there)", () => {
    const m = findExistingBill(query, [bill({ number: '108001', reference: 'INV-431' })]);
    expect(m).toMatchObject({ status: 'same', by: 'number' });
  });

  it('matches supplier + total + date when the number differs', () => {
    const m = findExistingBill({ ...query, invoiceNumber: 'X-1' }, [bill({})]);
    expect(m).toMatchObject({ status: 'same', by: 'amount-date' });
  });

  it('reports a different total as "different in the books", never a new bill', () => {
    const m = findExistingBill({ ...query, total: 130 }, [bill({})]);
    expect(m?.status).toBe('different');
    expect(m?.reason).toMatch(/total 120.00 in the books, 130.00 on the document/);
  });

  it('needs a known, equal currency for the total + date match', () => {
    const q = { ...query, invoiceNumber: 'X-1' };
    expect(findExistingBill({ ...q, currency: null }, [bill({})])).toBeUndefined();
    expect(findExistingBill({ ...q, currency: 'EUR' }, [bill({})])).toBeUndefined();
  });

  it("doesn't match another supplier's bill", () => {
    expect(
      findExistingBill(query, [bill({ contact: { id: 'b', name: 'Other' } })])
    ).toBeUndefined();
  });
});

describe('supplierDiff', () => {
  const record = contact('a', {
    name: 'Trey Energy',
    email: 'billing@trey.example',
    phone: '0117 496 0203',
    taxNumber: 'GB 200 0411 51',
    address: {
      line1: '5 Harbour Road',
      city: 'Bristol',
      postalCode: 'BS4 4QT',
      country: 'United Kingdom',
    },
  });

  it('proposes a changed address and phone, old → new', () => {
    const diffs = supplierDiff(
      record,
      ev({
        address: {
          line1: 'Unit 7 Riverside Park',
          line2: null,
          city: 'Bristol',
          region: null,
          postalCode: 'BS2 0JA',
          country: 'United Kingdom',
        },
        phone: '0117 496 0277',
        email: 'billing@trey.example',
        taxNumber: 'GB200041151',
      })
    );
    expect(diffs.map((d) => d.field)).toEqual(['address', 'phone']);
    expect(diffs[0]).toMatchObject({
      current: '5 Harbour Road, Bristol, BS4 4QT, United Kingdom',
      proposed: 'Unit 7 Riverside Park, Bristol, BS2 0JA, United Kingdom',
    });
    // The printed address replaces the old one whole.
    expect(diffs[0].value).toMatchObject({ line1: 'Unit 7 Riverside Park', line2: '' });
  });

  it("keeps the record's country, region and postcode when the document doesn't print them", () => {
    const diffs = supplierDiff(
      record,
      ev({
        address: {
          line1: 'Unit 7 Riverside Park',
          line2: null,
          city: 'Bristol',
          region: null,
          postalCode: null,
          country: null,
        },
      })
    );
    expect(diffs[0].value).toEqual({
      line1: 'Unit 7 Riverside Park',
      line2: '',
      city: 'Bristol',
      region: '',
      postalCode: 'BS4 4QT',
      country: 'United Kingdom',
    });
    expect(diffs[0].proposed).toBe('Unit 7 Riverside Park, Bristol, BS4 4QT, United Kingdom');
  });

  it('proposes nothing when the printed parts already match the record', () => {
    expect(
      supplierDiff(
        record,
        ev({
          address: {
            line1: '5 Harbour Road',
            line2: null,
            city: null,
            region: null,
            postalCode: null,
            country: null,
          },
        })
      )
    ).toEqual([]);
  });

  it('treats the same phone in international format as unchanged', () => {
    expect(supplierDiff(record, ev({ phone: '+44 117 496 0203' }))).toEqual([]);
  });

  it('proposes a VAT number and email the record lacks, and never clears a field', () => {
    const diffs = supplierDiff(
      contact('b'),
      ev({ taxNumber: 'GB 999 0001 42', email: 'a@b.example' })
    );
    expect(diffs.map((d) => d.field)).toEqual(['email', 'taxNumber']);
    expect(supplierDiff(record, {})).toEqual([]);
  });

  it('never includes bank details', () => {
    const diffs = supplierDiff(
      contact('a', { bankDetails: 'Sort code 04-00-04, account 41000004' }),
      ev({
        bankDetails: {
          accountName: null,
          sortCode: '09-01-28',
          accountNumber: '77341920',
          iban: null,
          bic: null,
        },
      })
    );
    expect(diffs).toEqual([]);
  });
});

describe('the bank-details rule', () => {
  const printed = (sortCode: string, accountNumber: string) => ({
    accountName: null,
    sortCode,
    accountNumber,
    iban: null,
    bic: null,
  });

  it('matches the record', () => {
    expect(
      bankCheck('Sort code 04-00-04, account 41000004', printed('04 00 04', '41000004'))
    ).toEqual({
      status: 'matches',
    });
  });

  it('flags changed bank details', () => {
    expect(
      bankCheck('Sort code 04-00-04, account 41000004', printed('09-01-28', '77341920'))
    ).toMatchObject({
      status: 'differs',
    });
  });

  it('flags bank details on the invoice when the record has none', () => {
    expect(bankCheck(null, printed('09-01-28', '77341920'))).toMatchObject({ status: 'new' });
  });

  it("says it can't compare when the source doesn't expose bank details", () => {
    expect(bankCheck(undefined, printed('09-01-28', '77341920'))).toMatchObject({
      status: 'unknown',
    });
  });

  it('compares IBANs', () => {
    const iban = {
      accountName: null,
      sortCode: null,
      accountNumber: null,
      iban: 'GB29 NWBK 6016 1331 9268 19',
      bic: null,
    };
    expect(bankCheck('IBAN GB29NWBK60161331926819', iban)).toEqual({ status: 'matches' });
    expect(bankCheck('IBAN GB82WEST12345698765432', iban)).toMatchObject({ status: 'differs' });
  });

  it('has nothing to check when the invoice prints no bank details', () => {
    expect(bankCheck('anything', null)).toEqual({ status: 'none-on-document' });
  });

  it('never puts bank details on a proposed new supplier', () => {
    const input = newSupplierInput(
      ev({
        name: 'Wingtip Office Supplies Ltd',
        bankDetails: printed('04-00-99', '41009999'),
        senderAddress: 'orders@wingtip.example',
      })
    );
    expect(input).toMatchObject({
      name: 'Wingtip Office Supplies Ltd',
      email: 'orders@wingtip.example',
      isSupplier: true,
    });
    expect(JSON.stringify(input)).not.toMatch(/41009999|04-00-99/);
  });
});
