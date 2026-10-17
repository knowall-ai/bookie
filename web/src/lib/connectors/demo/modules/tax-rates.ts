import type { DemoData } from '../data';
import type { TaxRatesModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoTaxRates(data: DemoData): TaxRatesModule | undefined {
  void data;
  return undefined;
}
