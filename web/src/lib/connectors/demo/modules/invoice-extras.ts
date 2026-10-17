import type { BrandingTheme } from '@/lib/domain/types';
import { ConnectorError, type InvoicesModule } from '../../types';
import type { DemoData } from '../data';
import { notFound } from '../index';
import { demoRecord } from './history';

/** Fictional branding themes: two, so the editor's theme picker shows in the demo. */
export const DEMO_BRANDING_THEMES: BrandingTheme[] = [
  { id: 'theme-standard', name: 'Standard', sortOrder: 0 },
  { id: 'theme-wholesale', name: 'Wholesale price list', sortOrder: 1 },
];

export function demoInvoiceExtras(
  data: DemoData
): Pick<InvoicesModule, 'onlineUrl' | 'markAsSent' | 'brandingThemes'> {
  const find = (id: string) => data.invoices.find((i) => i.id === id) ?? notFound('Invoice');
  return {
    async onlineUrl(id) {
      const invoice = find(id);
      if (invoice.type !== 'sales' || !['authorised', 'paid'].includes(invoice.status)) {
        throw new ConnectorError('Only approved sales invoices have an online link.', 409, 'demo');
      }
      return `https://invoices.example.com/contoso/${encodeURIComponent(invoice.id)}`;
    },
    async markAsSent(id) {
      const invoice = find(id);
      if (invoice.type !== 'sales' || invoice.status !== 'authorised') {
        throw new ConnectorError(
          'Only approved sales invoices can be marked as sent.',
          409,
          'demo'
        );
      }
      invoice.sentToContact = true;
      demoRecord(data, 'invoice', id, 'Marked as sent', `${invoice.number} marked as sent.`);
      return structuredClone(invoice);
    },
    brandingThemes: async () => structuredClone(DEMO_BRANDING_THEMES),
  };
}
