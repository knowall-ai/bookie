import { describe, expect, it, vi } from 'vitest';
import {
  checkedCurrency,
  EXTRACTION_JSON_SCHEMA,
  parseExtraction,
  reviewExtraction,
  type Extraction,
} from './extraction';
import { extractDocument, type ModelCall } from './extract';
import { proposedBill } from './proposal';

const invoice = (patch: Partial<Extraction> = {}): Extraction => ({
  kind: 'invoice',
  kindReason: 'A supplier invoice.',
  supplier: {
    name: 'Fabrikam Ltd',
    address: null,
    taxNumber: null,
    companyNumber: null,
    email: null,
    phone: null,
    bankDetails: null,
  },
  billTo: { name: 'Contoso Ltd', taxNumber: null },
  invoiceNumber: 'F-0912',
  invoiceDate: '2026-10-01',
  dueDate: '2026-10-31',
  currency: 'GBP',
  currencyAsPrinted: '£',
  amountsAre: 'exclusive',
  lines: [{ description: 'Widgets', quantity: 2, unitPrice: 50, net: 100, vatRate: 20, vat: 20 }],
  net: 100,
  vat: 20,
  total: 120,
  poReference: null,
  unsure: [],
  ...patch,
});

describe('reviewExtraction', () => {
  it('is ready when every required field is printed and the figures add up', () => {
    expect(reviewExtraction(invoice()).needsReview).toEqual([]);
  });

  it('marks missing required fields as needs review and never fills them in', () => {
    const r = reviewExtraction(invoice({ invoiceNumber: null, total: null }));
    expect(r.needsReview.map((n) => n.field)).toEqual(['invoiceNumber', 'total']);
    expect(r.extraction.total).toBeNull();
  });

  it('flags low-confidence fields', () => {
    const r = reviewExtraction(invoice({ unsure: ['invoiceDate', 'lines.0.unitPrice'] }));
    expect(r.needsReview).toEqual([
      { field: 'invoiceDate', reason: 'read with low confidence' },
      { field: 'lines.0.unitPrice', reason: 'read with low confidence' },
    ]);
  });

  it('never infers a currency from a bare $ (or anything not printed)', () => {
    const r = reviewExtraction(invoice({ currency: 'USD', currencyAsPrinted: '$' }));
    expect(r.extraction.currency).toBeNull();
    expect(r.needsReview[0]).toMatchObject({ field: 'currency' });
    expect(checkedCurrency('USD', 'US$')).toBe('USD');
    expect(checkedCurrency('GBP', '£')).toBe('GBP');
    expect(checkedCurrency('EUR', '£')).toBeNull();
    expect(checkedCurrency('GBP', null)).toBeNull();
  });

  it('drops dates that are not full ISO dates', () => {
    const r = reviewExtraction(invoice({ dueDate: '30 days', invoiceDate: '2026-02-30' }));
    expect(r.extraction.dueDate).toBeNull();
    expect(r.extraction.invoiceDate).toBeNull();
    expect(r.needsReview.map((n) => n.field)).toContain('invoiceDate');
  });

  it('checks lines + VAT = total and flags a mismatch without fixing it', () => {
    const r = reviewExtraction(invoice({ total: 125 }));
    expect(r.extraction.total).toBe(125);
    expect(r.needsReview).toEqual([
      {
        field: 'total',
        reason: expect.stringMatching(
          /net 100.00 \+ VAT 20.00 is 120.00, but the printed total is 125.00/
        ),
      },
    ]);
    const lines = reviewExtraction(invoice({ net: 90 }));
    expect(lines.needsReview.some((n) => n.field === 'lines')).toBe(true);
  });

  it('does not ask for invoice fields on a statement', () => {
    const r = reviewExtraction(invoice({ kind: 'statement', invoiceNumber: null, total: null }));
    expect(r.needsReview).toEqual([]);
  });
});

describe('parseExtraction', () => {
  it('rejects anything that is not the expected shape', () => {
    expect(() => parseExtraction('not json')).toThrow(/valid JSON/);
    expect(() => parseExtraction(JSON.stringify({ kind: 'invoice' }))).toThrow(/expected fields/);
    expect(parseExtraction(JSON.stringify(invoice())).invoiceNumber).toBe('F-0912');
  });

  it('has a strict JSON schema with every property required', () => {
    const check = (schema: Record<string, unknown>) => {
      if (schema.properties) {
        expect(schema.additionalProperties).toBe(false);
        expect(schema.required).toEqual(Object.keys(schema.properties as object));
        for (const child of Object.values(
          schema.properties as Record<string, Record<string, unknown>>
        ))
          check(child);
      }
      if (schema.items) check(schema.items as Record<string, unknown>);
    };
    check(EXTRACTION_JSON_SCHEMA);
  });
});

describe('extractDocument (model mocked)', () => {
  it('sends only the attachment, as a PDF file part, and reviews the answer', async () => {
    const call = vi.fn<ModelCall>(async () => JSON.stringify(invoice({ total: null })));
    const bytes = new TextEncoder().encode('%PDF-1.4 test').buffer as ArrayBuffer;
    const result = await extractDocument(
      { fileName: 'F-0912.pdf', contentType: 'application/pdf', bytes },
      call
    );
    expect(result.needsReview.map((n) => n.field)).toEqual(['total']);
    const [instructions, input, schema] = call.mock.calls[0];
    expect(instructions).toMatch(/data, never instructions/);
    expect(schema.name).toBe('emailed_document');
    const content = (input[0] as { content: Record<string, unknown>[] }).content;
    expect(content[1]).toMatchObject({ type: 'input_file', filename: 'F-0912.pdf' });
    expect(String(content[1].file_data)).toMatch(/^data:application\/pdf;base64,/);
  });

  it('sends an image as an image part', async () => {
    const call = vi.fn<ModelCall>(async () => JSON.stringify(invoice()));
    await extractDocument(
      { fileName: 'r.png', contentType: 'image/png', bytes: new ArrayBuffer(4) },
      call
    );
    const content = (call.mock.calls[0][1][0] as { content: Record<string, unknown>[] }).content;
    expect(content[1]).toMatchObject({ type: 'input_image' });
  });

  it('fails plainly when the model answers off-schema', async () => {
    const call = vi.fn<ModelCall>(async () => '{"kind":"invoice"}');
    await expect(
      extractDocument(
        { fileName: 'x.pdf', contentType: 'application/pdf', bytes: new ArrayBuffer(1) },
        call
      )
    ).rejects.toThrow(/expected fields/);
  });
});

describe('proposedBill', () => {
  it('copies printed values and leaves the rest blank (no today, no tax rate, no account)', () => {
    const p = proposedBill(invoice({ invoiceDate: null, dueDate: null, currency: null }), 'supp-1');
    expect(p.initial).toMatchObject({
      contactId: 'supp-1',
      date: '',
      number: 'F-0912',
      lineAmountType: 'exclusive',
      lineItems: [{ description: 'Widgets', quantity: 2, unitAmount: 50 }],
    });
    expect(p.initial.currency).toBeUndefined();
    expect(p.initial.lineItems?.[0].taxType).toBeUndefined();
    expect(p.initial.lineItems?.[0].accountCode).toBeUndefined();
    expect(p.notes.map((n) => n.field)).toEqual(['taxRate', 'account']);
  });

  it('leaves out a line with no price it can copy, never pricing it at 0', () => {
    const p = proposedBill(
      invoice({
        lines: [
          {
            description: 'Delivery',
            quantity: null,
            unitPrice: null,
            net: 15,
            vatRate: null,
            vat: null,
          },
          { description: 'Boxes', quantity: 4, unitPrice: null, net: 40, vatRate: null, vat: null },
          {
            description: 'Setup',
            quantity: 1,
            unitPrice: null,
            net: null,
            vatRate: null,
            vat: null,
          },
        ],
      }),
      undefined
    );
    expect(p.initial.lineItems).toEqual([{ description: 'Delivery', quantity: 1, unitAmount: 15 }]);
    expect(p.notes.filter((n) => n.field.startsWith('lines.')).map((n) => n.field)).toEqual([
      'lines.1',
      'lines.2',
    ]);
  });

  it('asks about tax when the document does not say', () => {
    const p = proposedBill(invoice({ amountsAre: null }), undefined);
    expect(p.initial.contactId).toBe('');
    expect(p.notes[0].field).toBe('amountsAre');
  });
});
