import type { BankAccount, BankTransactionInput } from '@/lib/domain/types';
import { ConnectorError } from '../../types';
import type { BcClient, ODataList } from '../client';
import type { BankModule } from '../../types';
import { journalBatchCode, postAndRemoveBatch } from './journals';

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
 * unreconciled count are all left undefined rather than guessed.
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

export const BC_BANK_LEDGER_NOTE =
  "Business Central's API doesn't publish bank account ledger entries, so Bookie can't list this account's transactions. Open the bank account in Business Central to see them.";

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

export function bcBank(client: BcClient, lcy: () => Promise<string>): BankModule {
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
      const [currency, result] = await Promise.all([
        lcy(),
        client.request<ODataList<BcBankAccount>>('bankAccounts', {
          query: { $filter: 'blocked eq false', $orderby: 'number' },
        }),
      ]);
      return result.value.map((raw) => fromBcBankAccount(raw, currency));
    },

    async transactions(_bankAccountId, query) {
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
  };
}
