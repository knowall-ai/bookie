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

/**
 * Smallest size first; the plain `photo` is the fallback when 48x48 isn't stored.
 * `user` is `me` or someone's address in the directory.
 */
export function photoUrls(user = 'me'): string[] {
  const base =
    user === 'me'
      ? 'https://graph.microsoft.com/v1.0/me'
      : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}`;
  return [`${base}/photos/48x48/$value`, `${base}/photo/$value`];
}

export const PHOTO_URLS = photoUrls();

const TIMEOUT_MS = 5_000;
/** Raster images only: never serve, say, SVG from our own origin. */
const PHOTO_TYPE = /^image\/(jpeg|png|gif|webp)\b/;

/**
 * A Microsoft 365 profile photo, read with the signed-in user's own Graph token:
 * their own (User.Read covers /me/photo) or, given an address, someone in their
 * directory such as an agent or a shared mailbox (User.ReadBasic.All). Without
 * one, the UI shows initials or an icon.
 */
export async function fetchProfilePhoto(
  auth: AuthContext,
  user = 'me'
): Promise<ProfilePhotoResult> {
  if (auth.mode === 'demo') return 'none';
  let token: string;
  try {
    token = await auth.getToken('graph');
  } catch (error) {
    console.error('[bookie] no Graph token for the profile photo', error);
    return 'unavailable';
  }
  for (const url of photoUrls(user)) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (!PHOTO_TYPE.test(contentType)) return 'unavailable';
        return { bytes: await response.arrayBuffer(), contentType };
      }
      // Someone else's photo the signed-in person may not read (no User.ReadBasic.All, or an
      // address Graph can't resolve) is as good as none: the icon shows and is cached.
      if (user !== 'me' && (response.status === 403 || response.status === 400)) return 'none';
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
