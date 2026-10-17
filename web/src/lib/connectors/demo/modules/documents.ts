/**
 * Shared helpers for the demo Sales/Purchases documents (quotes, credit notes,
 * purchase orders). Fictional data only.
 */
import type { Contact, Item, LineItem, LineItemInput } from '@/lib/domain/types';
import { ConnectorError } from '../../types';
import type { DemoData } from '../data';

export const VAT_RATE = 0.2;

const round = (n: number) => Math.round(n * 100) / 100;

/** Price lines at 20% VAT, the way the demo invoices are priced. */
export function priceLines(lines: LineItemInput[], side: 'sales' | 'purchase'): LineItem[] {
  return lines.map((l, i) => {
    const lineAmount = round(l.quantity * l.unitAmount * (1 - (l.discountRate ?? 0) / 100));
    return {
      ...l,
      id: `line-${i + 1}`,
      taxType: l.taxType ?? (side === 'sales' ? 'OUTPUT2' : 'INPUT2'),
      lineAmount,
      taxAmount: round(lineAmount * VAT_RATE),
    };
  });
}

export function totals(lines: LineItem[]) {
  const subTotal = round(lines.reduce((s, l) => s + l.lineAmount, 0));
  const totalTax = round(lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0));
  return { subTotal, totalTax, total: round(subTotal + totalTax) };
}

export function contactOf(data: DemoData, id: string): Contact {
  const contact = data.contacts.find((c) => c.id === id);
  if (!contact) throw new ConnectorError('Contact not found.', 404, 'demo');
  return contact;
}

/** Deterministic line from the demo catalogue. */
export function catalogueLine(
  item: Item,
  quantity: number,
  side: 'sales' | 'purchase'
): LineItemInput {
  return {
    itemCode: item.code,
    description: item.name,
    quantity,
    unitAmount: side === 'sales' ? (item.salePrice ?? 50) : (item.purchasePrice ?? 40),
    accountCode: side === 'sales' ? item.salesAccountCode : (item.purchaseAccountCode ?? '310'),
  };
}
