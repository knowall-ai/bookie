import type { LineAmountType, LineItemInput } from '@/lib/domain/types';
import type { EditorValues } from '@/components/documents/DocumentEditor';
import type { Extraction, ReviewNote } from './extraction';

/**
 * The draft bill Bookie proposes from what the document prints, for the person to
 * check in the editor. Blank stays blank: no date defaults to today, no tax rate or
 * account is chosen, no currency is assumed.
 */
export interface ProposedBill {
  initial: Partial<EditorValues>;
  /** Extra things to check that come from turning the reading into editor fields. */
  notes: ReviewNote[];
}

const LINE_AMOUNTS: Record<NonNullable<Extraction['amountsAre']>, LineAmountType> = {
  exclusive: 'exclusive',
  inclusive: 'inclusive',
  'no-tax': 'none',
};

export function proposedBill(ex: Extraction, contactId: string | undefined): ProposedBill {
  const notes: ReviewNote[] = [];
  const lineItems: LineItemInput[] = [];
  ex.lines.forEach((line, i) => {
    if (line.quantity !== null && line.unitPrice !== null) {
      lineItems.push({
        description: line.description,
        quantity: line.quantity,
        unitAmount: line.unitPrice,
      });
    } else if (line.net !== null && (line.quantity === null || line.quantity === 1)) {
      // A line printed as a single amount: one of that amount, exactly as printed.
      lineItems.push({ description: line.description, quantity: 1, unitAmount: line.net });
    } else {
      // No price that can be copied as printed: leave the line out rather than invent one.
      notes.push({
        field: `lines.${i}`,
        reason: `"${line.description || `line ${i + 1}`}" has no unit price printed: add it by hand`,
      });
    }
  });
  if (ex.amountsAre === null)
    notes.push({
      field: 'amountsAre',
      reason: "the document doesn't say whether amounts include tax: choose in 'Amounts are'",
    });
  if (ex.lines.some((l) => l.vatRate !== null || l.vat !== null))
    notes.push({
      field: 'taxRate',
      reason: `choose the tax rate for each line (printed: ${
        [
          ...new Set(
            ex.lines.map((l) => (l.vatRate === null ? undefined : `${l.vatRate}%`)).filter(Boolean)
          ),
        ].join(', ') || 'VAT amounts only'
      })`,
    });
  notes.push({ field: 'account', reason: 'choose the account for each line' });
  return {
    initial: {
      contactId: contactId ?? '',
      // An empty date makes the person enter it; the editor never fills in today.
      date: ex.invoiceDate ?? '',
      dueDate: ex.dueDate ?? undefined,
      number: ex.invoiceNumber ?? undefined,
      currency: ex.currency ?? undefined,
      lineAmountType: ex.amountsAre ? LINE_AMOUNTS[ex.amountsAre] : 'exclusive',
      lineItems,
    },
    notes,
  };
}
