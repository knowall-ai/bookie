import type { BankTransaction } from '@/lib/domain/types';
import type { DemoData } from '../data';
import { demoSlot } from './state';
import { ConnectorError, type BankModule } from '../../types';
import { demoId, matches, notFound, paginate } from '../index';
import { demoTransfers } from './transfers';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A few fictional spend-money items so the register isn't only invoice payments. */
function seedSpendMoney(data: DemoData) {
  const today = new Date().toISOString().slice(0, 10);
  const day = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const lucerne = data.contacts.find((c) => c.name === 'Lucerne Property');
  const rows: [number, string, string, string, number, typeof lucerne][] = [
    [3, 'Monthly rent: Roastery Yard', 'RENT', '469', 1750, lucerne],
    [9, 'Card terminal fees', 'FEES', '404', 38.4, undefined],
    [33, 'Monthly rent: Roastery Yard', 'RENT', '469', 1750, lucerne],
    [40, 'Card terminal fees', 'FEES', '404', 41.15, undefined],
  ];
  const extras: BankTransaction[] = rows.map(
    ([days, description, reference, accountCode, amount, contact], i) => ({
      id: `bt-spend-${i + 1}`,
      bankAccountId: 'acc-090',
      bankAccountName: 'Business Current Account',
      date: day(days),
      type: 'spend' as const,
      contact: contact ? { id: contact.id, name: contact.name } : undefined,
      reference,
      description,
      amount,
      currency: 'GBP',
      isReconciled: i > 1,
      status: 'authorised' as const,
      lineItems: [
        { description, quantity: 1, unitAmount: amount, accountCode, lineAmount: amount },
      ],
    })
  );
  const transfers: BankTransaction[] = [
    {
      id: 'bt-transfer-out-1',
      bankAccountId: 'acc-090',
      bankAccountName: 'Business Current Account',
      date: day(20),
      type: 'transfer-out',
      reference: 'To savings',
      description: 'Bank transfer to Business Savings Account',
      amount: 5000,
      currency: 'GBP',
      isReconciled: true,
      status: 'authorised',
    },
    {
      id: 'bt-transfer-in-1',
      bankAccountId: 'acc-091',
      bankAccountName: 'Business Savings Account',
      date: day(20),
      type: 'transfer-in',
      reference: 'From current account',
      description: 'Bank transfer from Business Current Account',
      amount: 5000,
      currency: 'GBP',
      isReconciled: true,
      status: 'authorised',
    },
  ];
  data.bankTransactions.push(...extras, ...transfers);
  data.bankTransactions.sort((a, b) => b.date.localeCompare(a.date));
  // Keep "Balance in Xero" consistent with the register.
  for (const t of [...extras, ...transfers]) {
    const account = data.bankAccounts.find((a) => a.id === t.bankAccountId);
    if (!account) continue;
    const signed = t.type === 'receive' || t.type === 'transfer-in' ? t.amount : -t.amount;
    account.balance = r2((account.balance ?? 0) + signed);
    if (account.statementBalance !== undefined && t.isReconciled) {
      account.statementBalance = r2(account.statementBalance + signed);
    }
  }
}

export function demoBank(data: DemoData): BankModule {
  // Seed once per demo org, up front, so the dashboard's bank balances agree with this module.
  demoSlot(data, 'bank-seeded', () => {
    seedSpendMoney(data);
    return true;
  });
  const ready = () => data;
  return {
    ...demoTransfers(data),
    async accounts() {
      const d = ready();
      return structuredClone(
        d.bankAccounts.map((a) => ({
          ...a,
          unreconciledCount: d.bankTransactions.filter(
            (t) => t.bankAccountId === a.id && !t.isReconciled && t.status === 'authorised'
          ).length,
        }))
      );
    },
    async transactions(bankAccountId, query) {
      const d = ready();
      if (!d.bankAccounts.some((a) => a.id === bankAccountId)) notFound('Bank account');
      const all = d.bankTransactions.filter(
        (t) =>
          t.bankAccountId === bankAccountId &&
          t.status === 'authorised' &&
          (!query?.from || t.date >= query.from) &&
          (!query?.to || t.date <= query.to) &&
          matches([t.reference, t.description, t.contact?.name], query?.search)
      );
      return paginate(structuredClone(all), query);
    },
    async createTransaction(input) {
      const d = ready();
      const account = d.bankAccounts.find((a) => a.id === input.bankAccountId);
      if (!account) throw new ConnectorError('Choose a bank account.', 400, 'demo');
      const contact = d.contacts.find((c) => c.id === input.contactId) ?? notFound('Contact');
      const lineItems = input.lineItems.map((l) => {
        const lineAmount = r2(l.quantity * l.unitAmount * (1 - (l.discountRate ?? 0) / 100));
        const rate = l.taxType && /2$/.test(l.taxType) ? 0.2 : 0;
        const taxAmount =
          input.lineAmountType === 'none'
            ? 0
            : input.lineAmountType === 'inclusive'
              ? r2(lineAmount - lineAmount / (1 + rate))
              : r2(lineAmount * rate);
        return { ...l, lineAmount, taxAmount };
      });
      const net = lineItems.reduce((s, l) => s + l.lineAmount, 0);
      const tax = lineItems.reduce((s, l) => s + l.taxAmount, 0);
      const amount = r2(input.lineAmountType === 'exclusive' ? net + tax : net);
      const transaction: BankTransaction = {
        id: demoId('bt'),
        bankAccountId: account.id,
        bankAccountName: account.name,
        date: input.date,
        type: input.type,
        contact: { id: contact.id, name: contact.name },
        reference: input.reference,
        description:
          lineItems
            .map((l) => l.description)
            .filter(Boolean)
            .join('; ') || contact.name,
        amount,
        currency: account.currency,
        isReconciled: false,
        status: 'authorised',
        lineItems,
      };
      d.bankTransactions.unshift(transaction);
      d.bankTransactions.sort((a, b) => b.date.localeCompare(a.date));
      account.balance = r2((account.balance ?? 0) + (input.type === 'receive' ? amount : -amount));
      return structuredClone(transaction);
    },
  };
}
