import { describe, expect, it } from 'vitest';
import {
  attachmentUrl,
  contentTypeFromName,
  formatFileSize,
  safeFileName,
  sniffUploadType,
  validateUpload,
} from './attachments';

const bytes = (...b: number[]) => new Uint8Array(b).buffer as ArrayBuffer;

describe('attachment rules', () => {
  it('accepts PDF, PNG and JPG up to 10 MB', () => {
    expect(validateUpload({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toBeUndefined();
    expect(validateUpload({ name: 'a.jpg', type: '', size: 1000 })).toBeUndefined();
    expect(validateUpload({ name: 'a.gif', type: 'image/gif', size: 10 })).toMatch(
      /PDF, PNG or JPG/
    );
    expect(
      validateUpload({ name: 'big.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 + 1 })
    ).toMatch(/10 MB/);
    expect(validateUpload({ name: 'e.pdf', type: 'application/pdf', size: 0 })).toMatch(/empty/);
  });

  it('sniffs real file signatures', () => {
    expect(sniffUploadType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe('application/pdf');
    expect(sniffUploadType(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('image/png');
    expect(sniffUploadType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffUploadType(bytes(0x3c, 0x68, 0x74, 0x6d))).toBeUndefined();
  });

  it('cleans file names for headers and paths', () => {
    expect(safeFileName('../../etc/passwd')).toBe('....etcpasswd');
    expect(safeFileName('Invoice "42".pdf')).toBe('Invoice 42.pdf');
    expect(safeFileName('..')).toBe('attachment');
  });

  it('types files by extension and formats sizes', () => {
    expect(contentTypeFromName('scan.JPEG')).toBe('image/jpeg');
    expect(contentTypeFromName('noext')).toBeUndefined();
    expect(formatFileSize(82801)).toBe('80.9 KB');
    expect(formatFileSize(undefined)).toBeUndefined();
  });

  it('builds proxy URLs with every segment encoded', () => {
    expect(attachmentUrl('xero.a.b', 'bill', 'id/1', 'att 1', true)).toBe(
      '/api/orgs/xero.a.b/attachments/bill/id%2F1/att%201?download=1'
    );
  });
});
