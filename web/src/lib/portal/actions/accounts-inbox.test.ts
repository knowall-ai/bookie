import { beforeEach, expect, it, vi } from 'vitest';
import type { InvoiceInput } from '@/lib/domain/types';
const mocks = vi.hoisted(() => ({
  review: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  attachment: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/context', () => ({ requireAuth: async () => ({ mode: 'demo' }) }));
vi.mock('@/lib/portal/context', () => ({
  orgContext: async () => ({
    base: '/portal/demo.contoso',
    connector: {
      contacts: { update: mocks.update, create: mocks.create },
      invoices: { delete: mocks.remove },
      attachments: { entities: ['bill'], upload: mocks.upload },
    },
  }),
}));
vi.mock('@/lib/accounts-inbox/review', () => ({
  accountsMailbox: async () => ({ ok: true, reader: { attachment: mocks.attachment } }),
  reviewOne: mocks.review,
}));
vi.mock('./invoices', () => ({ saveInvoice: mocks.save }));
import {
  createSupplierFromMail,
  createBillFromMail,
  updateSupplierFromMail,
} from './accounts-inbox';
const item = (level = 'unverified') => ({
  verdict: { kind: 'new' },
  trust: { level },
  supplier: { status: 'matched', contact: { id: 'supplier', name: 'Contoso' } },
  diffs: ['email', 'phone', 'address', 'taxNumber'].map((field) => ({
    field,
    label: field,
    value: field === 'address' ? { city: 'Leeds' } : 'printed',
  })),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.review.mockResolvedValue(item());
  mocks.save.mockResolvedValue({ ok: true, data: { id: 'draft' } });
  mocks.attachment.mockResolvedValue({
    fileName: 'invoice.pdf',
    contentType: 'application/pdf',
    bytes: new TextEncoder().encode('%PDF-1.4').buffer,
  });
  mocks.upload.mockRejectedValue(new Error('Upload failed'));
  mocks.remove.mockResolvedValue(undefined);
});
it.each(['email', 'phone', 'address', 'taxNumber'])(
  'rejects unverified %s updates on the server',
  async (field) => {
    expect(await updateSupplierFromMail('demo.contoso', 'message', 'att', [field])).toEqual({
      ok: false,
      error: 'Only from an email Exchange verified',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  }
);
it('allows verified contact details but rejects bank detail input', async () => {
  mocks.review.mockResolvedValue(item('trusted'));
  expect(
    (
      await updateSupplierFromMail('demo.contoso', 'message', 'att', [
        'email',
        'phone',
        'address',
        'taxNumber',
      ])
    ).ok
  ).toBe(true);
  expect(mocks.update).toHaveBeenCalledWith('supplier', {
    name: 'Contoso',
    taxNumber: 'printed',
    email: 'printed',
    phone: 'printed',
    address: { city: 'Leeds' },
  });
  expect((await updateSupplierFromMail('demo.contoso', 'message', 'att', ['bankDetails'])).ok).toBe(
    false
  );
});
it('compensates an attachment failure by deleting the created draft', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const result = await createBillFromMail('demo.contoso', 'message', 'att', {} as InvoiceInput);
  expect(mocks.save).toHaveBeenCalledWith('demo.contoso', undefined, {
    type: 'purchase',
    status: 'draft',
  });
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('draft');
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining("bill wasn't kept") });
});
it('reports the retained draft if compensating delete fails', async () => {
  mocks.remove.mockRejectedValueOnce(new Error('Delete failed'));
  expect(
    await createBillFromMail('demo.contoso', 'message', 'att', {} as InvoiceInput)
  ).toMatchObject({ ok: false, error: expect.stringContaining('saved as a draft') });
});

it.each(['trusted', 'unverified'])(
  'creates a %s supplier with only permitted fields',
  async (trust) => {
    const evidence = Object.fromEntries(
      Object.entries({
        name: 'Contoso',
        email: 'orders@example.com',
        phone: '01234567890',
        taxNumber: 'GB123456789',
        address: { city: 'Leeds' },
      }).map(([key, value]) => [key, { value, source: 'document' }])
    );
    mocks.review.mockResolvedValue({ ...item(trust), supplier: { status: 'none' }, evidence });
    mocks.create.mockResolvedValue({ id: 'new', name: 'Contoso' });
    expect((await createSupplierFromMail('demo.contoso', 'message', 'att')).ok).toBe(true);
    const input = mocks.create.mock.calls[0][0];
    expect(input).toMatchObject({
      name: 'Contoso',
      taxNumber: 'GB123456789',
      address: { city: 'Leeds' },
    });
    expect(input.email).toBe(trust === 'trusted' ? 'orders@example.com' : undefined);
    expect(input.phone).toBe(trust === 'trusted' ? '01234567890' : undefined);
  }
);
