import type { Currency } from '@/lib/domain/types';
import type { CurrenciesModule } from '../../types';
import type { BcClient } from '../client';

export interface BcCurrency {
  id: string;
  code: string;
  displayName?: string;
}

/**
 * BC's `currencies` entity lists foreign currencies only: the local currency
 * (LCY) is a company setting, not a row. Put LCY first so the list matches
 * "the currencies this company can invoice in".
 */
export function bcCurrencyList(rows: BcCurrency[], lcy: string): Currency[] {
  const foreign = rows
    .filter((r) => r.code && r.code.toUpperCase() !== lcy.toUpperCase())
    .map((r) => ({ code: r.code, name: r.displayName || undefined }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return [{ code: lcy }, ...foreign];
}

/**
 * Document headers take `currencyCode`. API v2.0 exposes no currency factor
 * on documents, so `acceptsRate` is false: BC takes the rate from its own
 * Currency Exchange Rates table.
 */
export function bcCurrencies(client: BcClient, lcy: () => Promise<string>): CurrenciesModule {
  return {
    acceptsRate: false,
    async list() {
      const [rows, base] = await Promise.all([
        client.all<BcCurrency>('currencies', { $select: 'id,code,displayName' }),
        lcy(),
      ]);
      return bcCurrencyList(rows, base);
    },
  };
}
