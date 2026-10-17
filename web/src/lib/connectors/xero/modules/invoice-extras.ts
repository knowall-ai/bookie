import type { BrandingTheme } from '@/lib/domain/types';
import type { InvoicesModule } from '../../types';
import { ConnectorError } from '../../types';
import type { XeroClient } from '../client';
import { fromXeroInvoice, type XeroInvoice } from '../mappers';

export interface XeroBrandingTheme {
  BrandingThemeID: string;
  Name?: string;
  SortOrder?: number;
  Type?: string;
}

/** Themes in Xero's own order (SortOrder 0 is the organisation's default). */
export function fromXeroBrandingThemes(raw: XeroBrandingTheme[]): BrandingTheme[] {
  return raw
    .filter((t) => t.BrandingThemeID && t.Name)
    .map((t) => ({ id: t.BrandingThemeID, name: t.Name!, sortOrder: t.SortOrder }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** Xero-only invoice features: online invoice link, mark as sent, branding themes. */
export function xeroInvoiceExtras(
  client: XeroClient,
  link: (invoice: ReturnType<typeof fromXeroInvoice>) => ReturnType<typeof fromXeroInvoice>
): Pick<InvoicesModule, 'onlineUrl' | 'markAsSent' | 'brandingThemes'> {
  return {
    async onlineUrl(id) {
      const result = await client.request<{ OnlineInvoices?: { OnlineInvoiceUrl?: string }[] }>(
        `Invoices/${encodeURIComponent(id)}/OnlineInvoice`
      );
      return result.OnlineInvoices?.[0]?.OnlineInvoiceUrl || undefined;
    },
    async markAsSent(id) {
      const result = await client.request<{ Invoices: XeroInvoice[] }>('Invoices', {
        method: 'POST',
        body: { Invoices: [{ InvoiceID: id, SentToContact: true }] },
      });
      const invoice = result.Invoices?.[0];
      if (!invoice) throw new ConnectorError('Invoice not found.', 404, 'xero');
      return link(fromXeroInvoice(invoice));
    },
    async brandingThemes() {
      const result = await client.request<{ BrandingThemes?: XeroBrandingTheme[] }>(
        'BrandingThemes'
      );
      return fromXeroBrandingThemes(result.BrandingThemes ?? []);
    },
  };
}
