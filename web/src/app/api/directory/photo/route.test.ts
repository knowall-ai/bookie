import { afterEach, describe, expect, it, vi } from 'vitest';

const getAuthContext = vi.fn();
const fetchProfilePhoto = vi.fn();
vi.mock('@/lib/auth/context', () => ({ getAuthContext: () => getAuthContext() }));
vi.mock('@/lib/auth/photo', () => ({
  fetchProfilePhoto: (a: unknown, u: unknown) => fetchProfilePhoto(a, u),
}));

const { GET } = await import('./route');
const get = (user?: string) =>
  GET(
    new Request(
      `http://localhost/api/directory/photo${user === undefined ? '' : `?user=${encodeURIComponent(user)}`}`
    )
  );

describe('GET /api/directory/photo', () => {
  afterEach(() => vi.resetAllMocks());

  it('refuses anonymous visitors without caching', async () => {
    getAuthContext.mockResolvedValue(null);
    const response = await get('bookie@contoso.example');
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchProfilePhoto).not.toHaveBeenCalled();
  });

  it('refuses anything that is not an email address', async () => {
    getAuthContext.mockResolvedValue({ mode: 'entra' });
    for (const user of [undefined, '', 'bookie', '../me', 'a@b']) {
      expect((await get(user)).status).toBe(400);
    }
    expect(fetchProfilePhoto).not.toHaveBeenCalled();
  });

  it('serves the photo for a lower-cased address with private caching', async () => {
    const auth = { mode: 'entra' };
    getAuthContext.mockResolvedValue(auth);
    fetchProfilePhoto.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/png',
    });
    const response = await get(' Bookie@Contoso.example ');
    expect(fetchProfilePhoto).toHaveBeenCalledWith(auth, 'bookie@contoso.example');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600');
  });

  it('is 404 with no photo and 503 when Graph is unavailable', async () => {
    getAuthContext.mockResolvedValue({ mode: 'entra' });
    fetchProfilePhoto.mockResolvedValueOnce('none').mockResolvedValueOnce('unavailable');
    expect((await get('accounts@contoso.example')).status).toBe(404);
    const down = await get('accounts@contoso.example');
    expect(down.status).toBe(503);
    expect(down.headers.get('cache-control')).toBe('no-store');
  });
});
