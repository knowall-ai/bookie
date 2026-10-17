'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/context';
import { configStoreFor } from '@/lib/config';
import { forgetBcDiscovery } from '@/lib/connectors/registry';
import { isConnectorError } from '@/lib/connectors/types';
import { orgContext } from '@/lib/portal/context';
import { bcWebhooksConfigured } from '@/lib/webhooks/config';
import { syncBcLiveUpdates } from '@/lib/webhooks/bc-live';
import { describeError, type ActionResult } from './util';

/**
 * Settings › Business Central › Live updates. Turning it on subscribes every
 * visible company (salesInvoices, purchaseInvoices, customers) to BC
 * webhooks; turning it off deletes Bookie's subscriptions. The setting is
 * saved only once BC has accepted the change.
 */
export async function setBcLiveUpdatesAction(
  enabled: boolean
): Promise<ActionResult<{ companies: number }>> {
  try {
    const auth = await requireAuth('/portal/settings');
    const on = z.boolean().parse(enabled);
    if (on && !bcWebhooksConfigured()) {
      return {
        ok: false,
        error:
          'Live updates need Bookie on a public HTTPS address with BOOKIE_WEBHOOK_SECRET set. See docs/WEBHOOKS.adoc.',
      };
    }
    const summary = await syncBcLiveUpdates(auth, on);
    const store = configStoreFor(auth);
    const settings = await store.getSettings();
    settings.businessCentral.liveUpdates = on;
    await store.saveSettings(settings);
    forgetBcDiscovery(auth);
    revalidatePath('/portal', 'layout');
    return {
      ok: true,
      data: { companies: (summary.created + summary.renewed + summary.kept) / 3 },
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

const eventsSchema = z
  .array(
    z.object({
      entity: z.enum(['invoice', 'contact']),
      id: z
        .string()
        .max(120)
        .regex(/^[\w:.-]+$/),
    })
  )
  .max(20);

export interface ResolvedLiveEvent {
  id: string;
  /** "Invoice INV-0042", "Bill 1234", "Northwind Traders". */
  label?: string;
  status?: string;
  overdue?: boolean;
  href?: string;
  /** Set when the record can't be read (deleted, or no longer visible). */
  missing?: boolean;
}

/**
 * Look up the real number and status of the documents in the Live feed, live
 * from the source, as the signed-in user. Nothing is cached or stored.
 */
export async function resolveLiveEvents(
  orgKey: string,
  events: { entity: 'invoice' | 'contact'; id: string }[]
): Promise<ActionResult<ResolvedLiveEvent[]>> {
  try {
    const parsed = eventsSchema.parse(events);
    const { connector, base } = await orgContext(orgKey);
    const results = await Promise.all(
      parsed.map(async ({ entity, id }): Promise<ResolvedLiveEvent> => {
        try {
          if (entity === 'invoice' && connector.invoices) {
            const invoice = await connector.invoices.get(id);
            const sales = invoice.type === 'sales';
            return {
              id,
              label: `${sales ? 'Invoice' : 'Bill'} ${invoice.number || ''}`.trim(),
              status: invoice.status,
              overdue: invoice.isOverdue,
              href: `${base}/${sales ? 'sales/invoices' : 'purchases/bills'}/${encodeURIComponent(invoice.id)}`,
            };
          }
          if (entity === 'contact' && connector.contacts) {
            const contact = await connector.contacts.get(id);
            return {
              id,
              label: contact.name,
              href: `${base}/contacts/${encodeURIComponent(contact.id)}`,
            };
          }
          return { id, missing: true };
        } catch (error) {
          if (isConnectorError(error) && (error.status === 404 || error.status === 400)) {
            return { id, missing: true };
          }
          throw error;
        }
      })
    );
    return { ok: true, data: results };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
