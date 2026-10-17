'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgContext } from '@/lib/portal/context';
import type { Attachment, InvoiceInput } from '@/lib/domain/types';
import { ATTACHMENT_ENTITIES } from '@/lib/domain/types';
import {
  contentTypeFromName,
  normaliseContentType,
  sniffUploadType,
  validateUpload,
} from '@/lib/attachments';
import { describeError, type ActionResult } from './util';
import { saveInvoice } from './invoices';

const target = z.object({
  entity: z.enum(ATTACHMENT_ENTITIES as [string, ...string[]]),
  id: z.string().trim().min(1).max(200),
});

/** Upload one file (PDF, PNG or JPG, max 10 MB) to a document. */
export async function uploadAttachment(
  orgKey: string,
  entity: string,
  id: string,
  form: FormData
): Promise<ActionResult<Attachment>> {
  try {
    const parsed = target.parse({ entity, id });
    const file = form.get('file');
    if (!(file instanceof File)) return { ok: false, error: 'Choose a file to upload.' };
    const invalid = validateUpload(file);
    if (invalid) return { ok: false, error: invalid };
    const bytes = await file.arrayBuffer();
    const declared = normaliseContentType(file.type) ?? contentTypeFromName(file.name);
    const actual = sniffUploadType(bytes);
    if (!actual || actual !== declared)
      return { ok: false, error: `${file.name} doesn't look like a real PDF, PNG or JPG.` };

    const { connector, base } = await orgContext(orgKey);
    const mod = connector.attachments;
    const docEntity = parsed.entity as (typeof ATTACHMENT_ENTITIES)[number];
    if (!mod?.upload || !mod.entities.includes(docEntity))
      return { ok: false, error: 'This organisation does not allow uploading files here.' };
    if (mod.maxUploadBytes && bytes.byteLength > mod.maxUploadBytes)
      return { ok: false, error: `${file.name} is larger than the source system allows.` };
    if (mod.maxFilesPerDocument) {
      const existing = await mod.list(docEntity, parsed.id);
      if (existing.length >= mod.maxFilesPerDocument)
        return {
          ok: false,
          error: `This document already has ${existing.length} files, the most allowed.`,
        };
    }
    const attachment = await mod.upload(docEntity, parsed.id, {
      fileName: file.name,
      contentType: actual,
      bytes,
    });
    revalidatePath(base, 'layout');
    return { ok: true, data: attachment };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/**
 * Save a new bill and attach the inbox file it was created from. If the file
 * can't be attached, the new draft is deleted again so a retry won't duplicate it.
 */
export async function createBillFromInboxFile(
  orgKey: string,
  fileId: string,
  input: InvoiceInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsedFileId = z.string().trim().min(1).max(200).parse(fileId);
    const { connector } = await orgContext(orgKey);
    const attach = connector.capture?.attachToBill;
    if (!attach) return { ok: false, error: 'This organisation has no capture inbox.' };
    const saved = await saveInvoice(orgKey, undefined, { ...input, type: 'purchase' });
    if (!saved.ok) return saved;
    try {
      await attach(parsedFileId, saved.data.id);
    } catch (error) {
      const reason = describeError(error);
      const removed = await connector.invoices
        ?.delete?.(saved.data.id)
        .then(() => true)
        .catch(() => false);
      return {
        ok: false,
        error: removed
          ? `The file couldn't be attached, so the bill wasn't kept: ${reason}`
          : `The bill was saved as a draft, but the file couldn't be attached: ${reason}`,
      };
    }
    return saved;
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
