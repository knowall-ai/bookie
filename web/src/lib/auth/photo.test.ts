import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from './context';
import { DEMO_MEMBER } from './dev';
import { fetchProfilePhoto, PHOTO_URLS } from './photo';

function auth(mode: AuthContext['mode'] = 'entra', getToken = vi.fn().mockResolvedValue('tok')) {
  return { mode, user: DEMO_MEMBER, getToken } satisfies AuthContext;
}

const jpeg = () =>
  new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'Content-Type': 'image/jpeg' } });

describe('fetchProfilePhoto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads the 48x48 photo with the user’s own Graph token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jpeg());
    vi.stubGlobal('fetch', fetchMock);
    const a = auth();
    const photo = await fetchProfilePhoto(a);
    expect(a.getToken).toHaveBeenCalledWith('graph');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(PHOTO_URLS[0]);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(photo?.contentType).toBe('image/jpeg');
    expect(new Uint8Array(photo!.bytes)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it('falls back to the default size when 48x48 is not stored', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(jpeg());
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchProfilePhoto(auth())).not.toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe(PHOTO_URLS[1]);
  });

  it('is null when the user has no photo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    expect(await fetchProfilePhoto(auth())).toBeNull();
  });

  it('is null on Graph errors, non-image responses and missing tokens', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    expect(await fetchProfilePhoto(auth())).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'nope' })));
    expect(await fetchProfilePhoto(auth())).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchProfilePhoto(auth())).toBeNull();

    const noToken = auth('entra', vi.fn().mockRejectedValue(new Error('reauth')));
    expect(await fetchProfilePhoto(noToken)).toBeNull();
  });

  it('never calls Graph in demo mode', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const a = auth('demo');
    expect(await fetchProfilePhoto(a)).toBeNull();
    expect(a.getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
