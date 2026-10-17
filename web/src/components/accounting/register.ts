import type { BankTransaction } from '@/lib/domain/types';

const DOCUMENT_LABEL: Record<NonNullable<BankTransaction['document']>['kind'], string> = {
  invoice: 'Invoice payment',
  bill: 'Bill payment',
  'credit-note': 'Credit note refund',
  prepayment: 'Prepayment',
  overpayment: 'Overpayment',
};

/** Xero's words for a register entry: Spend money, Receive money, Bank transfer, Payment. */
export function registerTypeLabel(t: BankTransaction): string {
  if (t.type === 'transfer-in' || t.type === 'transfer-out') return 'Bank transfer';
  if (t.source === 'payment') return t.document ? DOCUMENT_LABEL[t.document.kind] : 'Payment';
  return t.type === 'spend' ? 'Spend money' : 'Receive money';
}
