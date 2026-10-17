'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import {
  describeError,
  isoDate,
  lineItemSchema,
  currencyRateSchema,
  type ActionResult,
} from './util';
import type { InvoiceInput } from '@/lib/domain/types';

const invoiceSchema = z.object({
  type: z.enum(['sales', 'purchase']),
  contactId: z.string().min(1, 'Choose a contact.'),
  date: isoDate,
  dueDate: isoDate.optional(),
  number: z.string().trim().max(255).optional(),
  reference: z.string().trim().max(255).optional(),
  currency: z.string().length(3).optional(),
  currencyRate: currencyRateSchema,
  lineAmountType: z.enum(['exclusive', 'inclusive', 'none']).optional(),
  status: z.enum(['draft', 'submitted', 'authorised']).optional(),
  brandingThemeId: z.string().trim().max(60).optional(),
  lineItems: z.array(lineItemSchema).min(1, 'Add at least one line.'),
});

export async function saveInvoice(
  orgKey: string,
  id: string | undefined,
  input: InvoiceInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = invoiceSchema.parse(input) as InvoiceInput;
    const { connector, base } = await orgContext(orgKey);
    const mod = connector.invoices;
    const save = id ? mod?.update?.bind(null, id) : mod?.create;
    if (!save)
      return { ok: false, error: 'This organisation does not allow editing invoices here.' };
    const invoice = await save(parsed);
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: invoice.id } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function invoiceAction(
  orgKey: string,
  id: string,
  action: 'approve' | 'void' | 'delete' | 'email'
): Promise<ActionResult> {
  try {
    const { connector, base } = await orgContext(orgKey);
    const run = connector.invoices?.[action];
    if (!run) return { ok: false, error: 'This action is not available for this organisation.' };
    await run(id);
    revalidatePath(base, 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
