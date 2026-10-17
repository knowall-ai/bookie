import type { BankTransaction, BankTransfer } from '@/lib/domain/types';
import type { DemoData } from '../data';
import { demoSlot } from './state';
import { ConnectorError, type BankModule } from '../../types';
import { demoId, matches, paginate } from '../index';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Demo bank transfers. The bank module seeds one transfer pair into the
 * register (current → savings); the transfer list starts with that pair, and
 * every new transfer adds a spend-transfer and a receive-transfer line to the
 * two registers and moves both balances, as Xero does.
 */
function transfersOf(data: DemoData): BankTransfer[] {
  return demoSlot(data, 'transfers', () => {
    const out = data.bankTransactions.find((t) => t.id === 'bt-transfer-out-1');
    const into = data.bankTransactions.find((t) => t.id === 'bt-transfer-in-1');
    if (!out || !into) return [];
    return [
      {
        id: 'tr-0001',
        date: out.date,
        from: { id: out.bankAccountId, name: out.bankAccountName },
        to: { id: into.bankAccountId, name: into.bankAccountName },
        amount: out.amount,
        currency: out.currency,
        reference: out.reference,
        fromIsReconciled: out.isReconciled,
        toIsReconciled: into.isReconciled,
        status: 'authorised',
      },
    ];
  });
}

export function demoTransfers(data: DemoData): Pick<BankModule, 'transfers' | 'createTransfer'> {
  return {
    async transfers(query) {
      const all = transfersOf(data)
        .filter(
          (t) =>
            (!query?.from || t.date >= query.from) &&
            (!query?.to || t.date <= query.to) &&
            matches([t.reference, t.from.name, t.to.name], query?.search)
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      return paginate(structuredClone(all), query);
    },

    async createTransfer(input) {
      const from = data.bankAccounts.find((a) => a.id === input.fromBankAccountId);
      const to = data.bankAccounts.find((a) => a.id === input.toBankAccountId);
      if (!from || !to) throw new ConnectorError('Bank account not found.', 404, 'demo');
      if (from.id === to.id) {
        throw new ConnectorError('Choose two different bank accounts.', 400, 'demo');
      }
      if (from.currency !== to.currency) {
        throw new ConnectorError('Both accounts must be in the same currency.', 400, 'demo');
      }
      const amount = r2(input.amount);
      if (!(amount > 0)) throw new ConnectorError('Enter an amount above zero.', 400, 'demo');
      const transfer: BankTransfer = {
        id: demoId('tr'),
        date: input.date,
        from: { id: from.id, name: from.name },
        to: { id: to.id, name: to.name },
        amount,
        currency: from.currency,
        reference: input.reference,
        fromIsReconciled: false,
        toIsReconciled: false,
        status: 'authorised',
      };
      const line = (
        account: typeof from,
        type: 'transfer-in' | 'transfer-out',
        other: typeof from
      ): BankTransaction => ({
        id: demoId('bt'),
        bankAccountId: account.id,
        bankAccountName: account.name,
        date: input.date,
        type,
        reference: input.reference,
        description: `Bank transfer ${type === 'transfer-out' ? 'to' : 'from'} ${other.name}`,
        amount,
        currency: account.currency,
        isReconciled: false,
        status: 'authorised',
      });
      data.bankTransactions.unshift(line(from, 'transfer-out', to), line(to, 'transfer-in', from));
      data.bankTransactions.sort((a, b) => b.date.localeCompare(a.date));
      if (from.balance !== undefined) from.balance = r2(from.balance - amount);
      if (to.balance !== undefined) to.balance = r2(to.balance + amount);
      transfersOf(data).unshift(transfer);
      return structuredClone(transfer);
    },
  };
}
