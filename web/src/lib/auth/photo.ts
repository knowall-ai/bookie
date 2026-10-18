import 'server-only';
import type { AuthContext } from './context';

export interface ProfilePhoto {
  bytes: ArrayBuffer;
  contentType: string;
}

/** Smallest size first; the plain `/me/photo` is the fallback when 48x48 isn't stored. */
export const PHOTO_URLS = [
  'https://graph.microsoft.com/v1.0/me/photos/48x48/$value',
  'https://graph.microsoft.com/v1.0/me/photo/$value',
];

/**
 * The signed-in user's Microsoft 365 profile photo, read with their own Graph
 * token (User.Read covers /me/photo). `null` when they have none, in demo
 * mode, or when Graph can't be reached: the top bar shows initials instead.
 */
export async function fetchProfilePhoto(auth: AuthContext): Promise<ProfilePhoto | null> {
  if (auth.mode === 'demo') return null;
  let token: string;
  try {
    token = await auth.getToken('graph');
  } catch (error) {
    console.error('[bookie] no Graph token for the profile photo', error);
    return null;
  }
  for (const url of PHOTO_URLS) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.startsWith('image/')) return null;
        return { bytes: await response.arrayBuffer(), contentType };
      }
      // 404: no photo at this size (or none at all); try the next one.
      if (response.status !== 404) {
        console.error('[bookie] Graph profile photo failed', response.status);
        return null;
      }
    } catch (error) {
      console.error('[bookie] Graph profile photo failed', error);
      return null;
    }
  }
  return null;
}
