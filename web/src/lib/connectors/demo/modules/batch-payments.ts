import type { BatchPayment, Payment, PaymentInput } from '@/lib/domain/types';
import type { DemoData } from '../data';
import { demoSlot } from './state';
import { ConnectorError, type PaymentsModule } from '../../types';
import { demoId, matches, notFound, paginate } from '../index';
import { demoSourceKey, publish } from '@/lib/webhooks/events';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Demo batch payments: pay several approved bills from one bank account.
 * Each bill gets its own payment through `pay` (the demo payments module), so
 * bills, the register and balances stay consistent; the batch is remembered
 * on the demo books. Like Xero, each paid bill then raises an INVOICE UPDATE
 * event, which the Live panel on Home picks up.
 */
export function demoBatchPayments(
  data: DemoData,
  orgKey: string,
  pay: (input: PaymentInput) => Promise<Payment>
): Pick<PaymentsModule, 'batches' | 'createBatch'> {
  const batches = () => demoSlot<BatchPayment[]>(data, 'batch-payments', () => []);
  return {
    async batches(query) {
      const all = batches().filter(
        (b) =>
          (!query?.from || b.date >= query.from) &&
          (!query?.to || b.date <= query.to) &&
          matches([b.reference, b.bankAccountName], query?.search)
      );
      return paginate(structuredClone(all), query);
    },

    async createBatch(input) {
      const bank = data.bankAccounts.find((b) => b.id === input.bankAccountId);
      if (!bank) notFound('Bank account');
      // Validate every bill before paying any, so a batch is all-or-nothing.
      for (const p of input.payments) {
        const bill = data.invoices.find((i) => i.id === p.invoiceId) ?? notFound('Bill');
        if (bill.type !== 'purchase' || bill.status !== 'authorised') {
          throw new ConnectorError(`Bill ${bill.number} is not awaiting payment.`, 409, 'demo');
        }
        if (!(p.amount > 0) || p.amount > bill.amountDue + 0.005) {
          throw new ConnectorError(
            `Bill ${bill.number}: pay more than zero and no more than the amount due.`,
            400,
            'demo'
          );
        }
      }
      const payments: BatchPayment['payments'] = [];
      for (const p of input.payments) {
        const payment = await pay({
          invoiceId: p.invoiceId,
          bankAccountId: bank.id,
          date: input.date,
          amount: p.amount,
          reference: input.reference,
        });
        payments.push({ id: payment.id, invoiceId: p.invoiceId, amount: payment.amount });
      }
      const batch: BatchPayment = {
        id: demoId('batch'),
        date: input.date,
        type: 'purchase',
        bankAccountId: bank.id,
        bankAccountName: bank.name,
        currency: bank.currency,
        reference: input.reference,
        total: r2(payments.reduce((s, p) => s + p.amount, 0)),
        payments,
        isReconciled: false,
        status: 'authorised',
      };
      batches().unshift(batch);
      const at = new Date().toISOString();
      for (const p of payments) {
        publish({
          key: demoSourceKey(orgKey),
          entity: 'invoice',
          invoiceType: 'purchase',
          id: p.invoiceId,
          event: 'update',
          at,
        });
      }
      return structuredClone(batch);
    },
  };
}
