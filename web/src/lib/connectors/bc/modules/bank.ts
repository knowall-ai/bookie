import type { BankAccount, BankAccountInput, BankTransactionInput } from '@/lib/domain/types';
import { ConnectorError } from '../../types';
import type { BcClient, ODataList } from '../client';
import type { BankModule, NewBankAccountRules } from '../../types';
import { journalBatchCode, postAndRemoveBatch } from './journals';
import { extensionBankBalances, extensionBankTransactions, withBankBalance } from '../extension';

export interface BcBankAccount {
  id: string;
  number: string;
  displayName: string;
  bankAccountNumber?: string;
  iban?: string;
  blocked?: boolean;
  currencyCode?: string;
}

/**
 * BC's `bankAccounts` entity has no balance and no link to the G/L account its
 * posting group uses, so "Balance in BC", statement balance and the
 * unreconciled count are all left undefined rather than guessed. The Bookie BC
 * extension supplies them (see `withBankBalance` in ../extension).
 */
export function fromBcBankAccount(raw: BcBankAccount, lcy: string): BankAccount {
  return {
    id: raw.id,
    name: raw.displayName,
    code: raw.number,
    accountNumber: raw.bankAccountNumber || raw.iban || undefined,
    currency: raw.currencyCode || lcy,
    type: 'bank',
  };
}

/**
 * POST bankAccounts body (API v2.0: number, displayName, bankAccountNumber,
 * iban and currencyCode are writable). BC records the local currency as a
 * blank currency code, so LCY is sent as nothing at all; a blank number lets
 * BC take the next one from the company's Bank Account Nos. series.
 */
export function toBcBankAccount(input: BankAccountInput, lcy: string): Record<string, unknown> {
  const isLcy = !!lcy && input.currency.toUpperCase() === lcy.toUpperCase();
  return {
    number: input.code || undefined,
    displayName: input.name,
    bankAccountNumber: input.accountNumber || undefined,
    iban: input.iban ? input.iban.replace(/\s+/g, '').toUpperCase() : undefined,
    currencyCode: isLcy ? undefined : input.currency,
  };
}

/** Deep links into the BC web client for the new-bank-account form. */
export interface BcBankLinks {
  /** Bank Accounts list (page 371). */
  bankAccounts?: string;
  /** Currencies list (page 5). */
  currencies?: string;
}

export function bcNewBankAccount(links: BcBankLinks = {}): NewBankAccountRules {
  return {
    // BC bank accounts have no kind (credit card, PayPal): every one is a bank account.
    types: ['bank'],
    iban: true,
    codeOptional: true,
    codeHint:
      "Leave blank to take the next number from Business Central's Bank Account Nos. series.",
    // Bank Account table: No. is Code[20], Name Text[100], Bank Account No. Text[30].
    codeMaxLength: 20,
    nameMaxLength: 100,
    accountNumberMaxLength: 30,
    currencySetup: {
      text: 'To use another currency, add it on the Currencies page in Business Central.',
      href: links.currencies,
      linkLabel: 'Open Currencies',
    },
    note: {
      text: "Business Central's API can't set the bank account posting group. Before posting to the new account, open it in Business Central and choose its Bank Account Posting Group.",
      href: links.bankAccounts,
      linkLabel: 'Open Bank Accounts',
    },
  };
}

export const BC_BANK_LEDGER_NOTE =
  "Business Central's API doesn't publish bank account ledger entries, so Bookie can't list this account's transactions. Install the Bookie BC extension to see them here, or open the bank account in Business Central.";

/**
 * Spend/receive money as a general journal, the way BC itself records it:
 * the bank account line carries the total and each G/L line the other side,
 * all on one document number, posted on a batch of its own.
 */
export function toBcBankJournalLines(
  input: BankTransactionInput,
  bankNumber: string,
  documentNumber: string,
  contactName?: string
) {
  const sign = input.type === 'spend' ? 1 : -1;
  const lines = input.lineItems.map((l) => {
    const amount =
      Math.round(l.quantity * l.unitAmount * (1 - (l.discountRate ?? 0) / 100) * 100) / 100;
    return {
      accountType: 'G/L Account',
      accountNumber: l.accountCode,
      postingDate: input.date,
      documentNumber,
      externalDocumentNumber: input.reference || undefined,
      amount: sign * amount,
      description: (l.description || contactName || '').slice(0, 100),
    };
  });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return [
    {
      accountType: 'Bank Account',
      accountNumber: bankNumber,
      postingDate: input.date,
      documentNumber,
      externalDocumentNumber: input.reference || undefined,
      amount: -Math.round(total * 100) / 100,
      description: (contactName || input.reference || 'Bookie').slice(0, 100),
    },
    ...lines,
  ];
}

/**
 * `transfers`/`createTransfer` are deliberately absent: API v2.0 has no bank
 * transfer entity, and BC's bank account ledger entries aren't published, so
 * there is nothing to list. Moving money between bank accounts means a general
 * journal with two bank account lines posted as a batch, which Bookie won't do
 * for transfers (a posting mistake can't be undone from the API). Use
 * Business Central's own journals for transfers.
 */
export function bcBank(
  client: BcClient,
  lcy: () => Promise<string>,
  links?: BcBankLinks
): BankModule {
  const contactName = async (contactId: string) => {
    const [prefix, id] = [contactId.slice(0, 2), contactId.slice(2)];
    const entity = prefix === 'c:' ? 'customers' : prefix === 'v:' ? 'vendors' : undefined;
    if (!entity) return undefined;
    return client
      .request<{ displayName?: string }>(`${entity}(${id})`, { query: { $select: 'displayName' } })
      .then((c) => c.displayName)
      .catch(() => undefined);
  };

  return {
    async accounts() {
      const [currency, result, balances] = await Promise.all([
        lcy(),
        client.request<ODataList<BcBankAccount>>('bankAccounts', {
          query: { $filter: 'blocked eq false', $orderby: 'number' },
        }),
        // Bookie BC extension (bc-extension/): balances, last statement, unreconciled count.
        extensionBankBalances(client),
      ]);
      return result.value.map((raw) => {
        const account = fromBcBankAccount(raw, currency);
        const balance = balances?.get(raw.id.toLowerCase());
        return balance ? withBankBalance(account, balance) : account;
      });
    },

    async transactions(bankAccountId, query) {
      // Bookie BC extension (bc-extension/): the bank account ledger entries.
      const posted = await extensionBankTransactions(client, bankAccountId, query, lcy);
      if (posted) return posted;
      return {
        items: [],
        page: query?.page ?? 1,
        pageSize: query?.pageSize ?? 50,
        hasMore: false,
        total: 0,
        note: BC_BANK_LEDGER_NOTE,
      };
    },

    async createTransaction(input) {
      if (input.lineAmountType !== 'none' && input.lineItems.some((l) => l.taxType)) {
        throw new ConnectorError(
          'Business Central\'s journal API can\'t calculate VAT on spend or receive money. Choose "No tax" and enter gross amounts.',
          400,
          'business-central'
        );
      }
      if (input.lineItems.some((l) => !l.accountCode)) {
        throw new ConnectorError('Choose an account on every line.', 400, 'business-central');
      }
      const bank = await client.request<BcBankAccount>(`bankAccounts(${input.bankAccountId})`);
      const code = journalBatchCode();
      const documentNumber = `BOOKIE-${code.slice(2)}`;
      const name = await contactName(input.contactId);
      const batch = await client.request<{ id: string }>('journals', {
        method: 'POST',
        body: { code, displayName: `Bookie ${input.type} money` },
      });
      for (const line of toBcBankJournalLines(input, bank.number, documentNumber, name)) {
        await client.request(`journals(${batch.id})/journalLines`, { method: 'POST', body: line });
      }
      await postAndRemoveBatch(client, batch.id);
      const total = input.lineItems.reduce(
        (s, l) =>
          s + Math.round(l.quantity * l.unitAmount * (1 - (l.discountRate ?? 0) / 100) * 100) / 100,
        0
      );
      return {
        id: documentNumber,
        bankAccountId: input.bankAccountId,
        bankAccountName: bank.displayName,
        date: input.date,
        type: input.type,
        contact: name ? { id: input.contactId, name } : undefined,
        reference: input.reference,
        amount: total,
        currency: bank.currencyCode || (await lcy()),
        isReconciled: false,
        status: 'authorised',
      };
    },

    newAccount: bcNewBankAccount(links),
    async createAccount(input) {
      if (input.type && input.type !== 'bank') {
        throw new ConnectorError(
          'Business Central bank accounts have no account type such as credit card or PayPal.',
          400,
          'business-central'
        );
      }
      const currency = await lcy();
      const created = await client.request<BcBankAccount>('bankAccounts', {
        method: 'POST',
        body: toBcBankAccount(input, currency),
      });
      return fromBcBankAccount(created, currency);
    },
  };
}
