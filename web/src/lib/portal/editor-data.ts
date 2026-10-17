import 'server-only';
import type { AccountingConnector } from '@/lib/connectors/types';
import type { EditorItem, EditorOption, EditorTaxRate } from '@/components/documents/DocumentEditor';

/**
 * Reference data for the document editor. Every source is optional: if a
 * connector lacks a module the editor falls back to free-text fields.
 */
export async function editorData(connector: AccountingConnector, side: 'sales' | 'purchase') {
  const [contacts, accounts, taxRates, items] = await Promise.all([
    connector.contacts
      ?.list({ role: side === 'sales' ? 'customer' : 'supplier', pageSize: 500 })
      .then((p) => p.items)
      .catch(() => []) ?? [],
    connector.accounts?.list().catch(() => []) ?? [],
    connector.taxRates?.list().catch(() => []) ?? [],
    connector.items?.list({ pageSize: 500 }).then((p) => p.items).catch(() => []) ?? [],
  ]);
  // Some sources don't flag customers/suppliers reliably; fall back to everyone.
  let parties = contacts;
  if (parties.length === 0 && connector.contacts) {
    parties = (await connector.contacts.list({ pageSize: 500 }).catch(() => ({ items: [] }))).items;
  }
  return {
    contacts: parties.map<EditorOption>((c) => ({ value: c.id, label: c.name })),
    accounts: accounts
      .filter((a) => a.status === 'active' && !a.isBank)
      .map<EditorOption>((a) => ({ value: a.code, label: `${a.code} · ${a.name}` })),
    taxRates: taxRates.filter((t) => t.status === 'active').map<EditorTaxRate>((t) => ({ taxType: t.taxType, name: `${t.name} (${t.rate}%)`, rate: t.rate })),
    items: items
      .filter((i) => (side === 'sales' ? i.isSold : i.isPurchased))
      .map<EditorItem>((i) => ({
        code: i.code,
        name: i.name,
        description: i.description,
        price: side === 'sales' ? i.salePrice : i.purchasePrice,
        accountCode: side === 'sales' ? i.salesAccountCode : i.purchaseAccountCode,
      })),
  };
}
