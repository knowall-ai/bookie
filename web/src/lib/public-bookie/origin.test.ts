import { describe, expect, it } from 'vitest';
import { clientIp, isAllowedOrigin } from './origin';

const SITE = ['https://getbook.ie', 'https://bookie.knowall.ai'];
const h = (init: Record<string, string>) => new Headers(init);

describe('isAllowedOrigin', () => {
  it('accepts the site origins', () => {
    expect(isAllowedOrigin(h({ origin: 'https://getbook.ie' }), SITE)).toBe(true);
    expect(isAllowedOrigin(h({ origin: 'https://bookie.knowall.ai' }), SITE)).toBe(true);
  });

  it('refuses other sites, look-alikes and http', () => {
    for (const origin of [
      'https://evil.example',
      'https://getbook.ie.evil.example',
      'https://evilgetbook.ie',
      'http://getbook.ie',
      'null',
    ]) {
      expect(isAllowedOrigin(h({ origin }), SITE)).toBe(false);
    }
  });

  it('falls back to Referer when there is no Origin', () => {
    expect(isAllowedOrigin(h({ referer: 'https://getbook.ie/security' }), SITE)).toBe(true);
    expect(isAllowedOrigin(h({ referer: 'https://evil.example/getbook.ie' }), SITE)).toBe(false);
  });

  it('refuses a request with neither', () => {
    expect(isAllowedOrigin(h({}), SITE)).toBe(false);
  });

  it('Origin wins over a matching Referer', () => {
    expect(
      isAllowedOrigin(h({ origin: 'https://evil.example', referer: 'https://getbook.ie/' }), SITE)
    ).toBe(false);
  });

  it('localhost only when allowed (development)', () => {
    const local = h({ origin: 'http://localhost:3129' });
    expect(isAllowedOrigin(local, SITE)).toBe(false);
    expect(isAllowedOrigin(local, SITE, { allowLocalhost: true })).toBe(true);
    expect(
      isAllowedOrigin(h({ origin: 'http://localhost.evil.example' }), SITE, {
        allowLocalhost: true,
      })
    ).toBe(false);
  });
});

describe('clientIp', () => {
  it('uses the rightmost X-Forwarded-For entry (the one App Service added)', () => {
    expect(clientIp(h({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9:51234' }))).toBe('203.0.113.9');
  });

  it('uses a trusted header when configured', () => {
    expect(
      clientIp(
        h({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '1.1.1.1' }),
        'cf-connecting-ip'
      )
    ).toBe('198.51.100.7');
  });

  it('handles IPv6 and missing headers', () => {
    expect(clientIp(h({ 'x-forwarded-for': '[2001:db8::1]:443' }))).toBe('2001:db8::1');
    expect(clientIp(h({}))).toBe('unknown');
  });
});
