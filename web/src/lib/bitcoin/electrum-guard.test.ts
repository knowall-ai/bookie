import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as dns } from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import { isPublicAddress, validateOrgElectrumUrl, SSL_REQUIRED } from './electrum-guard';
import { ElectrumClient } from './electrum';

afterEach(() => vi.restoreAllMocks());

describe('public addresses', () => {
  it.each([
    '0.1.2.3',
    '10.0.0.1',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '169.254.1.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.255',
    '224.0.0.1',
    '240.0.0.1',
    '::',
    '::1',
    'fc00::1',
    'fdff::1',
    'fe80::1',
    'febf::1',
    'ff00::1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:a00:1',
    '0:0:0:0:0:ffff:c0a8:101',
    'not-an-ip',
  ])('rejects %s', (ip) => expect(isPublicAddress(ip)).toBe(false));
  it.each(['192.0.2.1', '198.51.100.1', '203.0.113.1', '2001:db8::1', '::ffff:192.0.2.1'])(
    'accepts non-private %s',
    (ip) => expect(isPublicAddress(ip)).toBe(true)
  );
});

describe('organisation URL', () => {
  it('accepts TLS DNS names and IP literals', () => {
    expect(validateOrgElectrumUrl('ssl://electrum.example.com:50002')).toEqual({
      protocol: 'ssl',
      host: 'electrum.example.com',
      port: 50002,
      guarded: true,
    });
    expect(validateOrgElectrumUrl('ssl://[2001:db8::1]:1').host).toBe('2001:db8::1');
    expect(validateOrgElectrumUrl('ssl://192.0.2.1:65535').port).toBe(65535);
  });
  it('explains why TCP is rejected', () =>
    expect(() => validateOrgElectrumUrl('tcp://x:1')).toThrow(SSL_REQUIRED));
  it.each([
    'ssl://localhost:1',
    'ssl://x.local:1',
    'ssl://x.internal:1',
    'ssl://x.localhost:1',
    'ssl://LOCALHOST.:1',
    'ssl://electrum.example.com:0',
    'ssl://electrum.example.com:65536',
    'ssl://-bad.example.com:1',
    'ssl://[:::]:1',
    'ssl://999.999.999.999:1',
    'ssl://user@electrum.example.com:1',
  ])('rejects %s', (url) => expect(() => validateOrgElectrumUrl(url)).toThrow());
});

describe('connection guard', () => {
  it.each([
    { addresses: [{ address: '10.0.0.1', family: 4 }] },
    {
      addresses: [
        { address: '192.0.2.1', family: 4 },
        { address: '::1', family: 6 },
      ],
    },
    { addresses: [] },
  ])('rejects unsafe DNS answers before opening any socket %#', async ({ addresses }) => {
    vi.spyOn(dns, 'lookup').mockResolvedValue(addresses as never);
    const tcp = vi.spyOn(net, 'connect');
    const ssl = vi.spyOn(tls, 'connect');
    await expect(
      ElectrumClient.connect(validateOrgElectrumUrl('ssl://electrum.example.com:50002'))
    ).rejects.toThrow("That Electrum server's address isn't a public internet address.");
    expect(tcp).not.toHaveBeenCalled();
    expect(ssl).not.toHaveBeenCalled();
  });
});
