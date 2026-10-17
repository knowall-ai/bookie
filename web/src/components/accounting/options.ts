import type { Account, TaxRate } from '@/lib/domain/types';
import type { EditorOption, EditorTaxRate } from '@/components/documents/DocumentEditor';

/**
 * Active tax rates as select options. Rates the source doesn't quantify show
 * their name only and keep `rate` undefined, so no editor ever treats them as 0%.
 */
export function taxRateOptions(rates: TaxRate[]): EditorTaxRate[] {
  return rates
    .filter((t) => t.status === 'active')
    .map((t) => ({
      taxType: t.taxType,
      name: t.rate === undefined ? t.name : `${t.name} (${t.rate}%)`,
      rate: t.rate,
    }));
}

/** Active accounts as "code · name" options. */
export function accountOptions(accounts: Account[], { includeBank = false } = {}): EditorOption[] {
  return accounts
    .filter((a) => a.status === 'active' && (includeBank || !a.isBank))
    .map((a) => ({ value: a.code, label: a.code ? `${a.code} · ${a.name}` : a.name }));
}
