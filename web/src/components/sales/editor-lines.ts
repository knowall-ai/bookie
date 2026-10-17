import type { LineItem, LineItemInput } from '@/lib/domain/types';

/** Strip computed fields so a saved document's lines can seed the editor. */
export function toEditorLines(lines: LineItem[] | undefined): LineItemInput[] | undefined {
  return lines?.map(
    ({ itemCode, description, quantity, unitAmount, discountRate, accountCode, taxType }) => ({
      itemCode,
      description,
      quantity,
      unitAmount,
      discountRate,
      accountCode,
      taxType,
    })
  );
}
