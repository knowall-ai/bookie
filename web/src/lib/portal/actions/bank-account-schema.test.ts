import { describe, expect, it } from 'vitest';
import { bankAccountProblem, bankAccountSchema } from './bank-account-schema';
import { xeroNewBankAccount } from '@/lib/connectors/xero/modules/bank';
import { bcNewBankAccount } from '@/lib/connectors/bc/modules/bank';

const currencies = [{ code: 'GBP' }, { code: 'EUR' }];

describe('add bank account validation', () => {
  it('trims, upper-cases the currency and drops blank optional fields', () => {
    const parsed = bankAccountSchema.parse({
      name: '  Contoso Current  ',
      code: ' ',
      accountNumber: ' 12345678 ',
      iban: '',
      currency: 'eur',
    });
    expect(parsed).toEqual({
      name: 'Contoso Current',
      code: undefined,
      accountNumber: '12345678',
      iban: undefined,
      currency: 'EUR',
    });
  });

  it('rejects a missing name or currency, odd codes and malformed IBANs', () => {
    expect(bankAccountSchema.safeParse({ name: '', currency: 'GBP' }).success).toBe(false);
    expect(bankAccountSchema.safeParse({ name: 'A', currency: '' }).success).toBe(false);
    // BC currency codes can be longer than ISO's three letters.
    expect(bankAccountSchema.parse({ name: 'A', currency: 'euro' }).currency).toBe('EURO');
    expect(bankAccountSchema.parse({ name: 'A', currency: 'GBP', code: 'BANK_01/A' }).code).toBe(
      'BANK_01/A'
    );
    expect(bankAccountSchema.safeParse({ name: 'A', currency: 'GBP', code: 'a b' }).success).toBe(
      false
    );
    expect(bankAccountSchema.safeParse({ name: 'A', currency: 'GBP', iban: '12345' }).success).toBe(
      false
    );
    expect(bankAccountSchema.safeParse({ name: 'A', currency: 'GBP', type: 'loan' }).success).toBe(
      false
    );
  });

  it('applies Xero rules: account number required, code up to 10', () => {
    const xero = xeroNewBankAccount();
    expect(bankAccountProblem({ name: 'A', currency: 'GBP' }, xero, currencies)).toMatch(
      /account number/
    );
    expect(
      bankAccountProblem({ name: 'A', currency: 'GBP', type: 'paypal' }, xero, currencies)
    ).toMatch(/PayPal email/);
    expect(
      bankAccountProblem(
        { name: 'A', code: '12345678901', accountNumber: '1', currency: 'GBP' },
        xero,
        currencies
      )
    ).toMatch(/at most 10/);
    expect(
      bankAccountProblem(
        { name: 'A', accountNumber: '1', currency: 'GBP', iban: 'GB00X' },
        xero,
        currencies
      )
    ).toMatch(/IBAN/);
    expect(
      bankAccountProblem({ name: 'A', accountNumber: '1', currency: 'EUR' }, xero, currencies)
    ).toBeUndefined();
  });

  it('applies Business Central rules: bank only, names up to 100', () => {
    const bc = bcNewBankAccount();
    expect(bankAccountProblem({ name: 'A', currency: 'GBP' }, bc, currencies)).toBeUndefined();
    expect(
      bankAccountProblem({ name: 'A', currency: 'GBP', type: 'credit-card' }, bc, currencies)
    ).toMatch(/account type/);
    expect(bankAccountProblem({ name: 'x'.repeat(101), currency: 'GBP' }, bc, currencies)).toMatch(
      /at most 100/
    );
  });

  it('only allows a currency the books actually have', () => {
    expect(
      bankAccountProblem(
        { name: 'A', accountNumber: '1', currency: 'JPY' },
        xeroNewBankAccount(),
        currencies
      )
    ).toBe("JPY isn't set up in this organisation's books.");
    expect(
      bankAccountProblem({ name: 'A', currency: 'eur' }, bcNewBankAccount(), currencies)
    ).toBeUndefined();
  });
});
