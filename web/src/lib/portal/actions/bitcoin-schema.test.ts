import { describe, expect, it } from 'vitest';
import { electrumServerSchema } from './bitcoin-schema';

const valid = { url: 'ssl://electrum.example.com:50002', trusted: true };
describe('Electrum server schema', () => {
  it('trims input and accepts optional fingerprints', () => {
    expect(
      electrumServerSchema.parse({ ...valid, url: ` ${valid.url} `, certSha256: ' ' })
    ).toEqual({ ...valid, certSha256: undefined });
    for (const certSha256 of ['ab'.repeat(32), Array(32).fill('AB').join(':')]) {
      expect(electrumServerSchema.parse({ ...valid, certSha256 }).certSha256).toBe(certSha256);
    }
  });
  it.each([
    { ...valid, trusted: 'true' },
    { ...valid, tenantId: 'other' },
    { ...valid, url: 'tcp://x:1' },
    { ...valid, certSha256: 'abcd' },
    { ...valid, url: 'ssl://localhost:1' },
  ])('rejects invalid input %#', (input) =>
    expect(electrumServerSchema.safeParse(input).success).toBe(false)
  );
});
