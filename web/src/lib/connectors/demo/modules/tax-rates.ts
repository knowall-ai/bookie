import type { TaxRate } from '@/lib/domain/types';
import type { DemoData } from '../data';
import type { TaxRatesModule } from '../../types';

/** UK VAT rates as a Xero UK organisation lists them (fictional org, real rate names). */
const RATES: TaxRate[] = [
  ['20% (VAT on Income)', 'OUTPUT2', 20],
  ['20% (VAT on Expenses)', 'INPUT2', 20],
  ['5% (VAT on Income)', 'RROUTPUT', 5],
  ['5% (VAT on Expenses)', 'RRINPUT', 5],
  ['Zero Rated Income', 'ZERORATEDOUTPUT', 0],
  ['Zero Rated Expenses', 'ZERORATEDINPUT', 0],
  ['Exempt Income', 'EXEMPTOUTPUT', 0],
  ['Exempt Expenses', 'EXEMPTINPUT', 0],
  ['No VAT', 'NONE', 0],
  ['17.5% (VAT on Income)', 'OUTPUT', 17.5],
].map(([name, taxType, rate], i) => ({
  id: String(taxType),
  name: String(name),
  taxType: String(taxType),
  rate: Number(rate),
  // The pre-2011 17.5% rate is kept for history, as Xero does.
  status: i === 9 ? ('archived' as const) : ('active' as const),
}));

export function demoTaxRates(data: DemoData): TaxRatesModule {
  void data;
  return {
    async list() {
      return structuredClone(RATES);
    },
  };
}
