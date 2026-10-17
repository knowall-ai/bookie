import type { Currency } from '@/lib/domain/types';
import type { CurrenciesModule } from '../../types';
import type { XeroClient } from '../client';

export interface XeroCurrency {
  Code: string;
  Description?: string;
}

export function fromXeroCurrency(raw: XeroCurrency): Currency {
  return { code: raw.Code, name: raw.Description || undefined };
}

/**
 * GET Currencies: the currencies enabled in the organisation (the base
 * currency is always one of them). Documents and payments accept
 * `CurrencyRate`; without one Xero applies its own daily rate.
 */
export function xeroCurrencies(client: XeroClient): CurrenciesModule {
  let cached: Promise<Currency[]> | undefined;
  return {
    acceptsRate: true,
    list() {
      cached ??= client
        .request<{ Currencies: XeroCurrency[] }>('Currencies')
        .then((r) => (r.Currencies ?? []).map(fromXeroCurrency));
      return cached.catch((error) => {
        cached = undefined;
        throw error;
      });
    },
  };
}
