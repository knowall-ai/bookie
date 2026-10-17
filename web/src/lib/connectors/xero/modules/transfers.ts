import type { BankTransfer, BankTransferInput, ListQuery, Page } from '@/lib/domain/types';
import type { BankModule } from '../../types';
import { ConnectorError } from '../../types';
import { xeroDate, type XeroClient } from '../client';
import type { XeroAccount } from './accounts';

/* Raw shape, as GET BankTransfers returns it. */
export interface XeroBankTransfer {
  BankTransferID: string;
  Date?: string;
  DateString?: string;
  FromBankAccount: { AccountID: string; Name?: string; Code?: string };
  ToBankAccount: { AccountID: string; Name?: string; Code?: string };
  Amount?: number;
  CurrencyRate?: number;
  Reference?: string;
  FromIsReconciled?: boolean;
  ToIsReconciled?: boolean;
  Status?: 'AUTHORISED' | 'DELETED';
}

/**
 * Xero's transfer rows carry no currency; the from-account's currency comes
 * from the chart of accounts (`currencies`, by AccountID). When that lookup
 * doesn't know the account the currency stays unknown rather than assumed.
 */
export function fromXeroBankTransfer(
  raw: XeroBankTransfer,
  currencies?: Map<string, string>
): BankTransfer {
  return {
    id: raw.BankTransferID,
    date: xeroDate(raw.DateString ?? raw.Date) ?? '',
    from: { id: raw.FromBankAccount.AccountID, name: raw.FromBankAccount.Name || undefined },
    to: { id: raw.ToBankAccount.AccountID, name: raw.ToBankAccount.Name || undefined },
    amount: raw.Amount ?? 0,
    currency: currencies?.get(raw.FromBankAccount.AccountID),
    reference: raw.Reference || undefined,
    fromIsReconciled: raw.FromIsReconciled,
    toIsReconciled: raw.ToIsReconciled,
    status: raw.Status === 'DELETED' ? 'deleted' : 'authorised',
  };
}

export function toXeroBankTransfer(input: BankTransferInput): Record<string, unknown> {
  return {
    FromBankAccount: { AccountID: input.fromBankAccountId },
    ToBankAccount: { AccountID: input.toBankAccountId },
    Date: input.date,
    Amount: input.amount,
    Reference: input.reference || undefined,
  };
}

const DEFAULT_PAGE_SIZE = 50;

/** Currency per bank account id (Xero leaves CurrencyCode off base-currency accounts). */
export async function bankCurrencies(client: XeroClient): Promise<Map<string, string>> {
  const [accounts, org] = await Promise.all([
    client.request<{ Accounts: XeroAccount[] }>('Accounts', { query: { where: 'Type=="BANK"' } }),
    client.request<{ Organisations: { BaseCurrency?: string }[] }>('Organisation'),
  ]);
  const base = org.Organisations[0]?.BaseCurrency;
  const map = new Map<string, string>();
  for (const a of accounts.Accounts) {
    const currency = a.CurrencyCode || base;
    if (currency) map.set(a.AccountID, currency);
  }
  return map;
}

/**
 * Bank transfers. GET BankTransfers has no paging, so Bookie pages the
 * newest-first list itself.
 */
export function xeroTransfers(
  client: XeroClient
): Pick<BankModule, 'transfers' | 'createTransfer'> {
  return {
    async transfers(query?: ListQuery): Promise<Page<BankTransfer>> {
      const pageSize = query?.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = query?.page ?? 1;
      const where: string[] = [];
      if (query?.from) where.push(`Date>=DateTime(${query.from.replaceAll('-', ',')})`);
      if (query?.to) where.push(`Date<=DateTime(${query.to.replaceAll('-', ',')})`);
      const [result, currencies] = await Promise.all([
        client.request<{ BankTransfers: XeroBankTransfer[] }>('BankTransfers', {
          query: { where: where.join(' AND ') || undefined, order: 'Date DESC' },
        }),
        bankCurrencies(client).catch(() => undefined),
      ]);
      const all = (result.BankTransfers ?? [])
        .map((t) => fromXeroBankTransfer(t, currencies))
        .filter((t) => t.status === 'authorised')
        .filter((t) => {
          const needle = query?.search?.trim().toLowerCase();
          return (
            !needle ||
            [t.reference, t.from.name, t.to.name].some((v) => v?.toLowerCase().includes(needle))
          );
        });
      return {
        items: all.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        hasMore: all.length > page * pageSize,
        total: all.length,
      };
    },

    async createTransfer(input) {
      if (input.fromBankAccountId === input.toBankAccountId) {
        throw new ConnectorError('Choose two different bank accounts.', 400, 'xero');
      }
      const currencies = await bankCurrencies(client);
      const from = currencies.get(input.fromBankAccountId);
      const to = currencies.get(input.toBankAccountId);
      if (!from || !to) throw new ConnectorError('Bank account not found.', 404, 'xero');
      if (from !== to) {
        throw new ConnectorError(
          `Transfers between ${from} and ${to} accounts need an exchange rate. Record this one in Xero.`,
          400,
          'xero'
        );
      }
      const result = await client.request<{ BankTransfers: XeroBankTransfer[] }>('BankTransfers', {
        method: 'PUT',
        body: { BankTransfers: [toXeroBankTransfer(input)] },
      });
      return fromXeroBankTransfer(result.BankTransfers[0], currencies);
    },
  };
}
