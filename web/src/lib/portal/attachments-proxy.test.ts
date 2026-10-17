import { describe, expect, it, vi } from 'vitest';
import { ConnectorError, type AccountingConnector } from '@/lib/connectors/types';
import type { AuthContext } from '@/lib/auth/context';
import {
  attachmentResponse,
  fileHeaders,
  inboxFileResponse,
  type ProxyDeps,
} from './attachments-proxy';

vi.mock('@/lib/auth/context', () => ({ getAuthContext: vi.fn() }));
vi.mock('@/lib/connectors/registry', () => ({ getConnector: vi.fn() }));

const auth = { mode: 'demo', user: { id: 'u', tenantId: 't', name: 'A', email: 'a@example.com' } };
const pdf = new TextEncoder().encode('%PDF-1.4').buffer as ArrayBuffer;

function connectorWith(
  download = vi.fn().mockResolvedValue({
    bytes: pdf,
    contentType: 'application/pdf',
    fileName: 'Invoice 1.pdf',
  })
): AccountingConnector {
  return {
    attachments: { entities: ['invoice', 'bill'], list: vi.fn(), download },
    capture: { inboxFile: download },
  } as unknown as AccountingConnector;
}

const deps = (overrides: Partial<ProxyDeps> = {}): ProxyDeps => ({
  auth: async () => auth as AuthContext,
  connector: async () => connectorWith(),
  ...overrides,
});

const params = {
  org: 'demo.contoso',
  entity: 'bill',
  id: 'bill-1',
  attachmentId: 'a-1',
  download: false,
};

describe('attachment proxy authorisation', () => {
  it('refuses anonymous requests without touching a connector', async () => {
    const connector = vi.fn();
    const res = await attachmentResponse(params, deps({ auth: async () => null, connector }));
    expect(res.status).toBe(401);
    expect(connector).not.toHaveBeenCalled();
  });

  it('re-resolves the org through getConnector for every request', async () => {
    const connector = vi.fn().mockResolvedValue(connectorWith());
    await attachmentResponse(params, deps({ connector }));
    await attachmentResponse(params, deps({ connector }));
    expect(connector).toHaveBeenCalledTimes(2);
    expect(connector).toHaveBeenCalledWith(auth, 'demo.contoso');
  });

  it('answers 404 for an org the user cannot reach', async () => {
    const connector = vi
      .fn()
      .mockRejectedValue(new ConnectorError('Organisation not found.', 404, 'demo'));
    const res = await attachmentResponse(params, deps({ connector }));
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('hides source 403s as 404s', async () => {
    const download = vi.fn().mockRejectedValue(new ConnectorError('Forbidden', 403, 'xero'));
    const res = await attachmentResponse(
      params,
      deps({ connector: async () => connectorWith(download) })
    );
    expect(res.status).toBe(404);
  });

  it('404s unknown and unsupported entities', async () => {
    expect((await attachmentResponse({ ...params, entity: 'payroll' }, deps())).status).toBe(404);
    expect((await attachmentResponse({ ...params, entity: 'quote' }, deps())).status).toBe(404);
  });

  it('serves the bytes inline, never cached', async () => {
    const res = await attachmentResponse(params, deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toMatch(/^inline; filename="Invoice 1.pdf"/);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(pdf));
  });

  it('serves inbox files through the same checks', async () => {
    const res = await inboxFileResponse(
      { org: 'demo.contoso', fileId: 'f-1', download: true },
      deps()
    );
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment;/);
    const anon = await inboxFileResponse(
      { org: 'demo.contoso', fileId: 'f-1', download: false },
      deps({ auth: async () => null })
    );
    expect(anon.status).toBe(401);
  });
});

describe('file headers', () => {
  it('forces risky types to download as octet-stream', () => {
    const headers = fileHeaders(
      { bytes: pdf, contentType: 'text/html', fileName: '<script>.html' },
      false
    );
    expect(headers['Content-Type']).toBe('application/octet-stream');
    expect(headers['Content-Disposition']).toMatch(/^attachment; filename="script.html"/);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('renders images inline', () => {
    const headers = fileHeaders({ bytes: pdf, contentType: 'image/jpg', fileName: 'r.jpg' }, false);
    expect(headers['Content-Type']).toBe('image/jpeg');
    expect(headers['Content-Disposition']).toMatch(/^inline;/);
  });
});
