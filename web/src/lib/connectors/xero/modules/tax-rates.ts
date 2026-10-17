import type { TaxRate } from '@/lib/domain/types';
import type { XeroClient } from '../client';
import type { TaxRatesModule } from '../../types';

export interface XeroTaxRate {
  Name: string;
  TaxType: string;
  EffectiveRate?: number;
  DisplayTaxRate?: number;
  Status?: 'ACTIVE' | 'DELETED' | 'ARCHIVED' | 'PENDING';
}

export function fromXeroTaxRate(raw: XeroTaxRate): TaxRate {
  return {
    id: raw.TaxType,
    name: raw.Name,
    taxType: raw.TaxType,
    // Missing percentage stays unknown, never 0%.
    rate: raw.EffectiveRate ?? raw.DisplayTaxRate,
    status: raw.Status === 'ACTIVE' ? 'active' : 'archived',
  };
}

export function xeroTaxRates(client: XeroClient): TaxRatesModule {
  return {
    async list() {
      const result = await client.request<{ TaxRates: XeroTaxRate[] }>('TaxRates');
      return result.TaxRates.filter((t) => t.Status !== 'DELETED').map(fromXeroTaxRate);
    },
  };
}
