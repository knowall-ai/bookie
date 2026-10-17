import type { BcClient } from '../client';
import type { TaxRatesModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcTaxRates(client: BcClient): TaxRatesModule | undefined {
  void client;
  return undefined;
}
