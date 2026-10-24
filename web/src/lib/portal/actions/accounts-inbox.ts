'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/context';
import { orgContext } from '@/lib/portal/context';
import type { Address, ContactInput, InvoiceInput } from '@/lib/domain/types';
import { sniffUploadType } from '@/lib/attachments';
import { accountsMailbox, reviewOne, type InboxItem } from '@/lib/accounts-inbox/review';
import { canUpdateFromMail } from '@/lib/accounts-inbox/contact-policy';
import { newSupplierInput } from '@/lib/accounts-inbox/supplier';
import { describeError, type ActionResult } from './util';
import { saveInvoice } from './invoices';

/**
 * Writes from Email › accounts mailbox. Every one re-resolves the org, re-reads the
 * email from the mailbox and re-runs Bookie's checks on the server, so nothing the
 * browser sends can turn a suspicious email into a bill or change what's written.
 */

const id = z.string().trim().min(1).max(1000);

async function itemFor(orgKey: string, messageId: string, attachmentId: string) {
  const ids = z.object({ messageId: id, attachmentId: id }).parse({ messageId, attachmentId });
  const auth = await requireAuth(`/portal/${encodeURIComponent(orgKey)}/email`);
  const ctx = await orgContext(orgKey);
  const setup = await accountsMailbox(auth);
  if (!setup.ok) throw new InboxActionError('No accounts mailbox is set up in Settings.');
  const item = await reviewOne(auth, setup.reader, ctx.connector, ids.messageId, ids.attachmentId);
  if (!item) throw new InboxActionError('That document is no longer in the accounts mailbox.');
  return { ...ctx, reader: setup.reader, item, ids };
}

class InboxActionError extends Error {}

function fail(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: error instanceof InboxActionError ? error.message : describeError(error),
  };
}

function refuseUnlessNew(item: InboxItem): string | undefined {
  const v = item.verdict;
  if (v.kind === 'suspicious')
    return "Bookie won't make a bill from this email: it looks suspicious.";
  if (v.kind === 'in-books')
    return v.match.status === 'same'
      ? 'This invoice is already in the books.'
      : 'A bill with this supplier and number is already in the books with different details. Check it rather than adding a second one.';
  if (v.kind === 'not-invoice') return "This document isn't an invoice.";
  if (v.kind === 'unread') return `Bookie couldn't read this document: ${v.reason}`;
  return undefined;
}

/**
 * Save the proposed bill as a DRAFT (never approved) and attach the original
 * document from the email. If the file can't be attached, the new draft is deleted
 * again so a retry won't duplicate it.
 */
export async function createBillFromMail(
  orgKey: string,
  messageId: string,
  attachmentId: string,
  input: InvoiceInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const { connector, reader, item, ids } = await itemFor(orgKey, messageId, attachmentId);
    const refused = refuseUnlessNew(item);
    if (refused) return { ok: false, error: refused };
    const file = await reader.attachment(ids.messageId, ids.attachmentId);
    const actual = sniffUploadType(file.bytes);
    if (!actual) return { ok: false, error: `${file.fileName} isn't a real PDF, PNG or JPG.` };

    const upload = connector.attachments?.upload;
    const canAttach = !!upload && connector.attachments!.entities.includes('bill');
    const saved = await saveInvoice(orgKey, undefined, {
      ...input,
      type: 'purchase',
      status: 'draft',
    });
    if (!saved.ok || !canAttach) return saved;
    try {
      await upload('bill', saved.data.id, {
        fileName: file.fileName,
        contentType: actual,
        bytes: file.bytes,
      });
    } catch (error) {
      const reason = describeError(error);
      const removed = await connector.invoices
        ?.delete?.(saved.data.id)
        .then(() => true)
        .catch(() => false);
      return {
        ok: false,
        error: removed
          ? `The document couldn't be attached, so the bill wasn't kept: ${reason}`
          : `The bill was saved as a draft, but the document couldn't be attached: ${reason}`,
      };
    }
    return saved;
  } catch (error) {
    return fail(error);
  }
}

/** Add the supplier the document names, from what it prints (never its bank details). */
export async function createSupplierFromMail(
  orgKey: string,
  messageId: string,
  attachmentId: string
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const { connector, base, item } = await itemFor(orgKey, messageId, attachmentId);
    const refused = refuseUnlessNew(item);
    if (refused) return { ok: false, error: refused };
    if (item.supplier?.status !== 'none')
      return { ok: false, error: 'This supplier already has a contact in the books.' };
    const input = item.evidence && newSupplierInput(item.evidence, item.trust.level);
    if (!input) return { ok: false, error: "The document doesn't print the supplier's name." };
    const create = connector.contacts?.create;
    if (!create)
      return { ok: false, error: 'This organisation does not allow adding contacts here.' };
    const contact = await create(input);
    revalidatePath(base, 'layout');
    return { ok: true, data: { id: contact.id, name: contact.name } };
  } catch (error) {
    return fail(error);
  }
}

const diffFields = z
  .array(z.enum(['address', 'email', 'phone', 'taxNumber']))
  .min(1, 'Tick at least one detail to update.')
  .max(4);

/**
 * Update the ticked supplier details (address, email, phone, VAT number) to what the
 * document prints. The values come from the server's own re-reading, not the browser.
 * Bank details are never part of this.
 */
export async function updateSupplierFromMail(
  orgKey: string,
  messageId: string,
  attachmentId: string,
  fields: string[]
): Promise<ActionResult<{ updated: string[] }>> {
  try {
    const chosen = new Set(diffFields.parse(fields));
    const { connector, base, item } = await itemFor(orgKey, messageId, attachmentId);
    if ([...chosen].some((f) => !canUpdateFromMail(f, item.trust.level)))
      return { ok: false, error: 'Only from an email Exchange verified' };
    if (item.verdict.kind === 'suspicious')
      return { ok: false, error: "Bookie won't update a supplier from a suspicious email." };
    if (item.supplier?.status !== 'matched')
      return { ok: false, error: 'There is no single matching supplier to update.' };
    const update = connector.contacts?.update;
    if (!update)
      return { ok: false, error: 'This organisation does not allow editing contacts here.' };
    const diffs = (item.diffs ?? []).filter((d) => chosen.has(d.field));
    if (!diffs.length) return { ok: false, error: 'Those details already match the books.' };
    const contact = item.supplier.contact;
    const input: ContactInput = { name: contact.name };
    for (const d of diffs) {
      if (d.field === 'address') input.address = d.value as Address;
      else input[d.field] = d.value as string;
    }
    await update(contact.id, input);
    revalidatePath(base, 'layout');
    return { ok: true, data: { updated: diffs.map((d) => d.label) } };
  } catch (error) {
    return fail(error);
  }
}
