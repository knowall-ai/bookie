import { describe, expect, it } from 'vitest';
import { editorTotals } from './DocumentEditor';

const line = (unitAmount: number, taxType?: string) => ({
  description: 'Line',
  quantity: 2,
  unitAmount,
  taxType,
});
const rates = new Map<string, number | undefined>([
  ['STD', 20],
  ['BC-CODE', undefined],
]);
const rateFor = (t: string) => rates.get(t);

describe('document editor totals', () => {
  it('previews tax only when every line has a known rate', () => {
    expect(editorTotals([line(50, 'STD')], 'exclusive', rateFor)).toEqual({
      lineSum: 100,
      preview: { subTotal: 100, tax: 20, total: 120 },
    });
  });

  it('shows no tax or total when a line has no rate picked (the source applies its default)', () => {
    expect(editorTotals([line(50)], 'exclusive', rateFor)).toEqual({ lineSum: 100 });
  });

  it('never treats a tax code without a percentage as 0%', () => {
    expect(editorTotals([line(50, 'BC-CODE')], 'exclusive', rateFor).preview).toBeUndefined();
  });

  it('needs no rates when amounts have no tax, and ignores empty lines', () => {
    expect(editorTotals([line(50), line(0)], 'none', rateFor).preview).toEqual({
      subTotal: 100,
      tax: 0,
      total: 100,
    });
    expect(editorTotals([line(50, 'STD'), line(0)], 'inclusive', rateFor).preview).toEqual({
      subTotal: 83.33,
      tax: 16.67,
      total: 100,
    });
  });
});
