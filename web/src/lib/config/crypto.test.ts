import { describe, expect, it } from 'vitest';
import { open, seal } from './crypto';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('sealed tenant config', () => {
  it('round-trips a value for the same tenant and record', () => {
    const sealed = seal(A, 'connection:x', { secret: 'shh' });
    expect(open(A, 'connection:x', sealed)).toEqual({ secret: 'shh' });
    expect(sealed).not.toContain('shh');
  });

  it('cannot be opened by another tenant', () => {
    const sealed = seal(A, 'connection:x', { secret: 'shh' });
    expect(() => open(B, 'connection:x', sealed)).toThrow();
  });

  it('cannot be moved to another record slot in the same tenant', () => {
    const sealed = seal(A, 'connection:x', { secret: 'shh' });
    expect(() => open(A, 'connection:y', sealed)).toThrow();
  });

  it('detects tampering', () => {
    const sealed = seal(A, 'settings', { a: 1 });
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => open(A, 'settings', parts.join('.'))).toThrow();
  });
});
