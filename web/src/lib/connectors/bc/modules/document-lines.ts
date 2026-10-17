import type { LineItem, LineItemInput } from '@/lib/domain/types';

/** A BC API v2.0 document line (quote, credit memo, purchase order). */
export interface BcDocumentLine {
  id: string;
  lineType?: string;
  lineObjectNumber?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  directUnitCost?: number;
  unitCost?: number;
  discountPercent?: number;
  taxCode?: string;
  amountExcludingTax?: number;
  totalTaxAmount?: number;
  netAmount?: number;
}

export function fromBcDocumentLine(line: BcDocumentLine): LineItem {
  return {
    id: line.id,
    itemCode: line.lineType === 'Item' ? line.lineObjectNumber || undefined : undefined,
    accountCode: line.lineType === 'Account' ? line.lineObjectNumber || undefined : undefined,
    description: line.description ?? '',
    quantity: line.quantity ?? 0,
    unitAmount: line.unitPrice ?? line.directUnitCost ?? line.unitCost ?? 0,
    discountRate: line.discountPercent || undefined,
    taxType: line.taxCode || undefined,
    taxAmount: line.totalTaxAmount,
    lineAmount: line.amountExcludingTax ?? line.netAmount ?? 0,
  };
}

/** Sales documents price lines with `unitPrice`, purchase documents with `directUnitCost`. */
export function toBcDocumentLine(line: LineItemInput, price: 'unitPrice' | 'directUnitCost') {
  const lineType = line.itemCode ? 'Item' : line.accountCode ? 'Account' : 'Comment';
  return {
    lineType,
    lineObjectNumber: line.itemCode ?? line.accountCode,
    description: line.description,
    ...(lineType === 'Comment'
      ? {}
      : {
          quantity: line.quantity,
          [price]: line.unitAmount,
          discountPercent: line.discountRate,
          taxCode: line.taxType,
        }),
  };
}
