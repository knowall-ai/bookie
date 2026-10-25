import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, cspKind, proxy } from './proxy';

const request = (path: string) => new NextRequest(new URL(path, 'https://getbook.ie'));

describe('cspKind', () => {
  it.each([
    '/',
    '/privacy',
    '/signin',
    '/portal',
    '/nope',
    // Org keys contain dots: these are pages, not files.
    '/portal/demo.contoso',
    '/portal/demo.contoso/sales/invoices',
    '/portal/xero.tenant-1.org-1',
    '/portal/bc.production.company.png',
  ])('gives %s the page policy', (path) => expect(cspKind(path)).toBe('page'));

  it.each([
    '/api/public/pass',
    '/api/auth/session',
    '/robots.txt',
    '/sitemap.xml',
    '/icon.svg',
    '/bookie/avatar.png',
    '/bookie/bookie-intro.mp4',
  ])('gives %s the resource policy', (path) => expect(cspKind(path)).toBe('resource'));

  it.each([
    '/api/orgs/demo/attachments/invoices/1/2',
    '/api/orgs/demo/attachments/inbox/f1',
    '/api/orgs/demo/accounts-inbox/m1/a1',
    '/api/orgs/demo/invoices/INV-1/pdf',
    '/api/orgs/demo/quotes/Q-1/pdf',
  ])('leaves file route %s to set its own headers', (path) => expect(cspKind(path)).toBe('own'));
});

describe('proxy', () => {
  it('sets a fresh nonce CSP on pages and passes it to the render', () => {
    const first = proxy(request('/'));
    const second = proxy(request('/'));
    const csp = first.headers.get('Content-Security-Policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(second.headers.get('Content-Security-Policy')).not.toBe(csp);
    // NextResponse.next({ request: { headers } }) forwards overridden request headers.
    expect(first.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('locks down API responses', () => {
    expect(proxy(request('/api/public/status')).headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'"
    );
  });

  it('adds nothing to file routes', () => {
    const res = proxy(request('/api/orgs/demo/attachments/invoices/1/2'));
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('skips static output and /.well-known', () => {
    const source = new RegExp(`^${config.matcher[0].source}$`);
    expect(source.test('/_next/static/chunks/main.js')).toBe(false);
    expect(source.test('/_next/image')).toBe(false);
    expect(source.test('/.well-known/security.txt')).toBe(false);
    expect(source.test('/portal')).toBe(true);
    expect(source.test('/api/public/pass')).toBe(true);
  });
});
