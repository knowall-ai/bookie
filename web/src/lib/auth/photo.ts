import 'server-only';
import type { AuthContext } from './context';

export interface ProfilePhoto {
  bytes: ArrayBuffer;
  contentType: string;
}

/**
 * A photo, `'none'` when the user has no photo (Graph said 404 for every size,
 * or demo mode), or `'unavailable'` when Graph couldn't say right now.
 */
export type ProfilePhotoResult = ProfilePhoto | 'none' | 'unavailable';

/** Smallest size first; the plain `/me/photo` is the fallback when 48x48 isn't stored. */
export const PHOTO_URLS = [
  'https://graph.microsoft.com/v1.0/me/photos/48x48/$value',
  'https://graph.microsoft.com/v1.0/me/photo/$value',
];

const TIMEOUT_MS = 5_000;

/**
 * The signed-in user's Microsoft 365 profile photo, read with their own Graph
 * token (User.Read covers /me/photo). Without one, the top bar shows initials.
 */
export async function fetchProfilePhoto(auth: AuthContext): Promise<ProfilePhotoResult> {
  if (auth.mode === 'demo') return 'none';
  let token: string;
  try {
    token = await auth.getToken('graph');
  } catch (error) {
    console.error('[bookie] no Graph token for the profile photo', error);
    return 'unavailable';
  }
  for (const url of PHOTO_URLS) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.startsWith('image/')) return 'unavailable';
        return { bytes: await response.arrayBuffer(), contentType };
      }
      // 404: no photo at this size (or none at all); try the next one.
      if (response.status !== 404) {
        console.error('[bookie] Graph profile photo failed', response.status);
        return 'unavailable';
      }
    } catch (error) {
      console.error('[bookie] Graph profile photo failed', error);
      return 'unavailable';
    }
  }
  return 'none';
}
