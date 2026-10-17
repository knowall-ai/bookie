'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import { describeError, type ActionResult } from './util';

/** The customer-facing online invoice link (read only). */
export async function getOnlineInvoiceUrl(
  orgKey: string,
  invoiceId: string
): Promise<ActionResult<{ url: string }>> {
  try {
    const id = z.string().trim().min(1).parse(invoiceId);
    const { connector } = await orgContext(orgKey);
    const get = connector.invoices?.onlineUrl;
    if (!get)
      return { ok: false, error: 'Online invoices are not available for this organisation.' };
    const url = await get(id);
    if (!url) return { ok: false, error: 'No online invoice link was returned for this invoice.' };
    return { ok: true, data: { url } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/** Flag an approved sales invoice as sent, without emailing it. */
export async function markInvoiceSent(orgKey: string, invoiceId: string): Promise<ActionResult> {
  try {
    const id = z.string().trim().min(1).parse(invoiceId);
    const { connector, base } = await orgContext(orgKey);
    const mark = connector.invoices?.markAsSent;
    if (!mark) return { ok: false, error: 'This action is not available for this organisation.' };
    await mark(id);
    revalidatePath(base, 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
