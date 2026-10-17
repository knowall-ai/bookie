import type { TaxRate } from '@/lib/domain/types';
import type { BcClient, ODataList } from '../client';
import type { TaxRatesModule } from '../../types';

export interface BcTaxGroup {
  id: string;
  code: string;
  displayName?: string;
  taxType?: string;
}

/**
 * BC API v2.0 `taxGroups` are the codes sales and purchase lines carry in
 * `taxCode` (VAT product posting groups in VAT countries, tax groups in US
 * sales-tax ones). The percentages live in VAT Posting Setup / Tax Details,
 * which the API doesn't expose, so `rate` is 0 with `rateAvailable: false`.
 */
export function fromBcTaxGroup(raw: BcTaxGroup): TaxRate {
  return {
    id: raw.id,
    name: raw.displayName || raw.code,
    taxType: raw.code,
    rate: 0,
    rateAvailable: false,
    status: 'active',
  };
}

export function bcTaxRates(client: BcClient): TaxRatesModule {
  return {
    async list() {
      const result = await client.request<ODataList<BcTaxGroup>>('taxGroups', {
        query: { $orderby: 'code' },
      });
      return result.value.map(fromBcTaxGroup);
    },
  };
}
