import { afterEach, describe, expect, it, vi } from 'vitest';

const getAuthContext = vi.fn();
const fetchProfilePhoto = vi.fn();
vi.mock('@/lib/auth/context', () => ({ getAuthContext: () => getAuthContext() }));
vi.mock('@/lib/auth/photo', () => ({ fetchProfilePhoto: (a: unknown) => fetchProfilePhoto(a) }));

const { GET } = await import('./route');

describe('GET /api/me/photo', () => {
  afterEach(() => vi.resetAllMocks());

  it('refuses anonymous visitors without caching', async () => {
    getAuthContext.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchProfilePhoto).not.toHaveBeenCalled();
  });

  it('serves the signed-in user’s photo with private caching', async () => {
    const auth = { mode: 'entra' };
    getAuthContext.mockResolvedValue(auth);
    fetchProfilePhoto.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/jpeg',
    });
    const response = await GET();
    expect(fetchProfilePhoto).toHaveBeenCalledWith(auth);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('is 404 when there is no photo, so the top bar keeps the initials', async () => {
    getAuthContext.mockResolvedValue({ mode: 'demo' });
    fetchProfilePhoto.mockResolvedValue('none');
    const response = await GET();
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600');
  });

  it('does not cache a temporary Graph failure as "no photo"', async () => {
    getAuthContext.mockResolvedValue({ mode: 'entra' });
    fetchProfilePhoto.mockResolvedValue('unavailable');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
