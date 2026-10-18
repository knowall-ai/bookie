import { describe, expect, it } from 'vitest';
import type { BcClient } from './bc/client';
import type { XeroClient } from './xero/client';
import { bcBank, toBcBankAccount } from './bc/modules/bank';
import { toXeroBankAccount, xeroBank } from './xero/modules/bank';
import { createDemoConnector, DEMO_ORGS } from './demo';

/* Fictional ids and names only. */
const NEW_ID = '9a1c2f3e-0000-4000-8000-000000000001';

type Call = { path: string; method?: string; body?: unknown };
function recorder(answer: unknown) {
  const calls: Call[] = [];
  const request = async (path: string, init?: { method?: string; body?: unknown }) => {
    calls.push({ path, ...init });
    return answer;
  };
  return { calls, request };
}

describe('Xero: add bank account', () => {
  it('sends Type BANK with the chosen currency and Xero bank account type', () => {
    expect(
      toXeroBankAccount({
        name: 'Contoso Card',
        accountNumber: '4321',
        currency: 'EUR',
        type: 'credit-card',
      })
    ).toEqual({
      Type: 'BANK',
      Name: 'Contoso Card',
      Code: undefined,
      BankAccountNumber: '4321',
      BankAccountType: 'CREDITCARD',
      CurrencyCode: 'EUR',
    });
    expect(
      toXeroBankAccount({ name: 'Ops', code: '092', accountNumber: '1', currency: 'GBP' })
    ).toMatchObject({ Code: '092', BankAccountType: 'BANK', CurrencyCode: 'GBP' });
  });

  it('PUTs Accounts and maps the account Xero returns', async () => {
    const { calls, request } = recorder({
      Accounts: [
        {
          AccountID: NEW_ID,
          Name: 'Northwind Savings',
          Type: 'BANK',
          BankAccountNumber: '12345678',
          BankAccountType: 'BANK',
          CurrencyCode: 'USD',
        },
      ],
    });
    const bank = xeroBank({ request } as unknown as XeroClient, async () => 'GBP');
    expect(bank.newAccount).toMatchObject({ accountNumberRequired: true, codeMaxLength: 10 });
    const created = await bank.createAccount!({
      name: 'Northwind Savings',
      accountNumber: '12345678',
      currency: 'USD',
    });
    expect(calls).toEqual([expect.objectContaining({ path: 'Accounts', method: 'PUT' })]);
    expect(created).toMatchObject({ id: NEW_ID, currency: 'USD', type: 'bank' });
  });
});

describe('Business Central: add bank account', () => {
  it('sends the local currency as blank and a foreign one as its code', () => {
    const local = toBcBankAccount({ name: 'Fabrikam Bank', currency: 'gbp' }, 'GBP');
    expect(local).toEqual({
      number: undefined,
      displayName: 'Fabrikam Bank',
      bankAccountNumber: undefined,
      iban: undefined,
      currencyCode: undefined,
    });
    expect(
      toBcBankAccount(
        { name: 'Euro', code: 'EUR-01', iban: 'gb82 west 1234 5698 7654 32', currency: 'EUR' },
        'GBP'
      )
    ).toMatchObject({ number: 'EUR-01', iban: 'GB82WEST12345698765432', currencyCode: 'EUR' });
  });

  it('never treats an unknown local currency as a match', () => {
    expect(toBcBankAccount({ name: 'X', currency: 'GBP' }, '')).toMatchObject({
      currencyCode: 'GBP',
    });
  });

  it('POSTs bankAccounts and says the posting group must be set in BC', async () => {
    const { calls, request } = recorder({
      id: NEW_ID,
      number: 'BA-NEW',
      displayName: 'Fabrikam Bank',
      currencyCode: '',
    });
    const bank = bcBank({ request } as unknown as BcClient, async () => 'GBP', {
      bankAccounts: 'https://businesscentral.dynamics.com/x?page=371',
    });
    expect(bank.newAccount?.types).toEqual(['bank']);
    expect(bank.newAccount?.note?.text).toMatch(/posting group/);
    expect(bank.newAccount?.note?.href).toContain('page=371');
    const created = await bank.createAccount!({ name: 'Fabrikam Bank', currency: 'GBP' });
    expect(calls).toEqual([expect.objectContaining({ path: 'bankAccounts', method: 'POST' })]);
    expect(created).toMatchObject({ id: NEW_ID, code: 'BA-NEW', currency: 'GBP' });
  });

  it('refuses kinds BC bank accounts do not have', async () => {
    const { calls, request } = recorder({});
    const bank = bcBank({ request } as unknown as BcClient, async () => 'GBP');
    await expect(
      bank.createAccount!({ name: 'Card', currency: 'GBP', type: 'credit-card' })
    ).rejects.toThrow(/no account type/);
    expect(calls).toEqual([]);
  });
});

describe('demo: add bank account', () => {
  const connector = () => createDemoConnector(DEMO_ORGS[1]);

  it('adds a fictional account to the bank list and the chart of accounts', async () => {
    const c = connector();
    const created = await c.bank!.createAccount!({
      name: 'Contoso Euro Account',
      code: '093',
      accountNumber: 'DE00 0000 0000',
      currency: 'EUR',
    });
    expect(created).toMatchObject({ id: 'acc-093', currency: 'EUR', balance: 0 });
    expect((await c.bank!.accounts()).some((a) => a.id === 'acc-093')).toBe(true);
    expect((await c.accounts!.list()).find((a) => a.code === '093')).toMatchObject({
      isBank: true,
      type: 'BANK',
    });
  });

  it('rejects a used code and a currency the books do not have', async () => {
    const c = connector();
    await expect(
      c.bank!.createAccount!({ name: 'Again', code: '090', accountNumber: '1', currency: 'GBP' })
    ).rejects.toThrow(/already in use/);
    await expect(
      c.bank!.createAccount!({ name: 'Yen', accountNumber: '1', currency: 'JPY' })
    ).rejects.toThrow(/isn't set up/);
  });
});
