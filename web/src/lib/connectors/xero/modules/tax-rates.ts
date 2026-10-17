import type { XeroClient } from '../client';
import type { TaxRatesModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroTaxRates(client: XeroClient): TaxRatesModule | undefined {
  void client;
  return undefined;
}
