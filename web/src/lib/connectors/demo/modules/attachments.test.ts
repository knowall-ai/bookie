import { describe, expect, it } from 'vitest';
import { demoData } from '../data';
import { demoAttachments, demoCapture } from './attachments';
import { demoPdf, demoReceiptPng } from './fixture-files';

let n = 0;
const fresh = () => ({ data: structuredClone(demoData('contoso')), key: `test-${n++}` });

describe('demo attachments', () => {
  it('generates valid PDF and PNG fixtures', () => {
    expect(new TextDecoder().decode(demoPdf('Test', ['line']).slice(0, 5))).toBe('%PDF-');
    expect(Array.from(new Uint8Array(demoReceiptPng().slice(0, 4)))).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
  });

  it('uploads, lists and downloads in memory', async () => {
    const { data, key } = fresh();
    const mod = demoAttachments(data, key);
    const invoice = data.invoices.find((i) => i.type === 'sales' && i.status === 'draft')!;
    const bytes = demoPdf('Upload', []);
    const created = await mod.upload!('invoice', invoice.id, {
      fileName: 'quote.pdf',
      contentType: 'application/pdf',
      bytes,
    });
    expect(await mod.list('invoice', invoice.id)).toEqual([created]);
    const file = await mod.download('invoice', invoice.id, created.id);
    expect(file.fileName).toBe('quote.pdf');
    expect(file.bytes.byteLength).toBe(bytes.byteLength);
    await expect(mod.list('bill', invoice.id)).rejects.toThrow();
  });

  it('attaches an inbox file to a bill and lists captured bills', async () => {
    const { data, key } = fresh();
    const capture = demoCapture(data, key);
    const mod = demoAttachments(data, key);
    const { files } = await capture.inbox();
    expect(files.length).toBeGreaterThan(0);
    const bill = data.invoices.find((i) => i.type === 'purchase' && i.status === 'paid')!;
    await capture.attachToBill!(files[0].id, bill.id);
    expect((await capture.inbox()).files).toHaveLength(files.length);
    expect((await mod.list('bill', bill.id)).map((a) => a.fileName)).toContain(files[0].fileName);
    const captured = await capture.capturedBills();
    expect(captured.items).toHaveLength(1);
    expect(captured.items[0].reference).toContain('Captured by Bookie');
  });
});
