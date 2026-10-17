'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { QuoteInput } from '@/lib/domain/types';
import { describeError, isoDate, lineItemSchema, type ActionResult } from './util';

const optionalText = (max: number) => z.string().trim().max(max).optional();

const quoteSchema = z.object({
  contactId: z.string().min(1, 'Choose a contact.'),
  date: isoDate,
  expiryDate: isoDate.optional(),
  number: optionalText(255),
  reference: optionalText(255),
  title: optionalText(100),
  summary: optionalText(3000),
  terms: optionalText(4000),
  currency: z.string().length(3).optional(),
  lineAmountType: z.enum(['exclusive', 'inclusive', 'none']).optional(),
  lineItems: z.array(lineItemSchema).min(1, 'Add at least one line.'),
});

export async function saveQuote(
  orgKey: string,
  id: string | undefined,
  input: QuoteInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = quoteSchema.parse(input) as QuoteInput;
    const { connector, base } = await orgContext(orgKey);
    const mod = connector.quotes;
    const save = id ? mod?.update?.bind(null, id) : mod?.create;
    if (!save) return { ok: false, error: 'This organisation does not allow editing quotes here.' };
    const quote = await save(parsed);
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: quote.id } };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

const statusSchema = z.enum(['sent', 'accepted', 'declined', 'deleted']);

export async function setQuoteStatus(
  orgKey: string,
  id: string,
  status: z.infer<typeof statusSchema>
): Promise<ActionResult> {
  try {
    const parsed = statusSchema.parse(status);
    const { connector, base } = await orgContext(orgKey);
    const mod = connector.quotes;
    if (!mod?.setStatus || (mod.statusChanges && !mod.statusChanges.includes(parsed))) {
      return { ok: false, error: 'This action is not available for this organisation.' };
    }
    await mod.setStatus(z.string().min(1).parse(id), parsed);
    revalidatePath(base, 'layout');
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function convertQuoteToInvoice(
  orgKey: string,
  id: string
): Promise<ActionResult<{ invoiceId?: string }>> {
  try {
    const { connector, base } = await orgContext(orgKey);
    const convert = connector.quotes?.convertToInvoice;
    if (!convert) return { ok: false, error: 'This organisation cannot convert quotes here.' };
    const result = await convert(z.string().min(1).parse(id));
    revalidatePath(base, 'layout');
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
