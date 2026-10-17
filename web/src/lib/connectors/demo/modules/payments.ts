import type { Payment } from '@/lib/domain/types';
import { DEMO_TODAY, type DemoData } from '../data';
import type { PaymentsModule } from '../../types';
import { ConnectorError } from '../../types';
import { demoId, notFound, paginate } from '../index';
import { isForeign, toBaseAmount } from '@/lib/domain/currency';
import { demoBatchPayments } from './batch-payments';

/**
 * Demo payments are the payments recorded on the demo invoices and bills, so
 * recording one here updates the invoice (amount due, paid status) and adds a
 * matching bank transaction, as it would in Xero.
 */
export function demoPayments(data: DemoData, orgKey = 'demo'): PaymentsModule | undefined {
  const bankName = (id?: string) => data.bankAccounts.find((b) => b.id === id)?.name;
  const all = (): Payment[] =>
    data.invoices
      .filter((i) => i.status !== 'deleted' && i.status !== 'voided')
      .flatMap((invoice) =>
        (invoice.payments ?? []).map((p) => {
          const extra = p as { bankAccountId?: string; bankAmount?: number; currencyRate?: number };
          const bankAccountId = extra.bankAccountId ?? 'acc-090';
          const bank = data.bankAccounts.find((b) => b.id === bankAccountId);
          const foreign = isForeign(invoice.currency, bank?.currency ?? 'GBP');
          const rate = extra.currencyRate ?? invoice.currencyRate;
          return {
            id: p.id,
            date: p.date,
            amount: p.amount,
            currency: invoice.currency,
            ...(foreign && bank
              ? {
                  bankAmount:
                    extra.bankAmount ??
                    toBaseAmount(p.amount, invoice.currency, bank.currency, rate),
                  bankCurrency: bank.currency,
                  currencyRate: rate,
                }
              : {}),
            reference: p.reference,
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            invoiceType: invoice.type,
            contact: { ...invoice.contact },
            bankAccountId,
            bankAccountName: bankName(bankAccountId),
            status: 'authorised' as const,
          };
        })
      )
      .sort((a, b) => b.date.localeCompare(a.date));

  const mod: PaymentsModule = {
    async list(query) {
      return paginate(
        all().filter(
          (p) =>
            (!query?.invoiceType || p.invoiceType === query.invoiceType) &&
            (!query?.contactId || p.contact?.id === query.contactId) &&
            (!query?.from || p.date >= query.from) &&
            (!query?.to || p.date <= query.to)
        ),
        query
      );
    },
    async create(input) {
      const invoice = data.invoices.find((i) => i.id === input.invoiceId) ?? notFound('Invoice');
      if (invoice.status !== 'authorised') {
        throw new ConnectorError(
          'Payments can only be applied to approved documents.',
          409,
          'demo'
        );
      }
      const amount = Math.round(input.amount * 100) / 100;
      if (!(amount > 0) || amount > invoice.amountDue + 0.005) {
        throw new ConnectorError(
          `The payment must be more than zero and no more than the ${invoice.amountDue.toFixed(2)} due.`,
          400,
          'demo'
        );
      }
      const bank = data.bankAccounts.find((b) => b.id === input.bankAccountId);
      if (!bank) notFound('Bank account');
      // Demo bank accounts are in GBP. A euro invoice paid into one converts at the
      // rate entered, else the invoice's own rate: the demo has no daily-rate feed.
      const rate = isForeign(invoice.currency, bank.currency)
        ? (input.currencyRate ?? invoice.currencyRate)
        : undefined;
      const bankAmount = toBaseAmount(amount, invoice.currency, bank.currency, rate);
      if (bankAmount === undefined) {
        throw new ConnectorError(
          `Enter the exchange rate (${invoice.currency} per 1 ${bank.currency}) for this payment.`,
          400,
          'demo'
        );
      }
      const id = demoId('pay');
      invoice.payments = [
        ...(invoice.payments ?? []),
        // The extra field lets the payments list show which account was used.
        {
          id,
          date: input.date,
          amount,
          reference: input.reference,
          bankAccountId: bank.id,
          bankAmount,
          currencyRate: rate,
        } as never,
      ];
      invoice.amountPaid = Math.round((invoice.amountPaid + amount) * 100) / 100;
      invoice.amountDue =
        Math.round((invoice.total - invoice.amountPaid - (invoice.amountCredited ?? 0)) * 100) /
        100;
      if (invoice.amountDue <= 0) {
        invoice.amountDue = 0;
        invoice.status = 'paid';
      }
      invoice.isOverdue =
        invoice.status === 'authorised' && !!invoice.dueDate && invoice.dueDate < DEMO_TODAY();
      const receive = invoice.type === 'sales';
      data.bankTransactions.unshift({
        id: demoId('bt'),
        bankAccountId: bank.id,
        bankAccountName: bank.name,
        date: input.date,
        type: receive ? 'receive' : 'spend',
        contact: { ...invoice.contact },
        reference: input.reference || invoice.number,
        description: `Payment ${invoice.number}`,
        amount: bankAmount,
        currency: bank.currency,
        isReconciled: false,
        status: 'authorised',
      });
      if (bank.balance !== undefined) bank.balance += receive ? bankAmount : -bankAmount;
      return {
        id,
        date: input.date,
        amount,
        currency: invoice.currency,
        ...(rate !== undefined
          ? { bankAmount, bankCurrency: bank.currency, currencyRate: rate }
          : {}),
        reference: input.reference,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        invoiceType: invoice.type,
        contact: { ...invoice.contact },
        bankAccountId: bank.id,
        bankAccountName: bank.name,
        status: 'authorised',
      };
    },
  };
  return { ...mod, ...demoBatchPayments(data, orgKey, (input) => mod.create!(input)) };
}
