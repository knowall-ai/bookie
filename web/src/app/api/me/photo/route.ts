import { getAuthContext } from '@/lib/auth/context';
import { fetchProfilePhoto } from '@/lib/auth/photo';

/**
 * The signed-in user's own profile photo, for the top bar. Bookie never stores
 * it and never puts it in the session cookie: it's fetched from Graph on demand
 * and cached only in this user's browser (private, varies by session cookie).
 * A confirmed "no photo" is cached too; a temporary Graph failure is not.
 */
const CACHE = 'private, max-age=3600';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const photo = await fetchProfilePhoto(auth);
  if (photo === 'unavailable') {
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const headers = { 'Cache-Control': CACHE, Vary: 'Cookie' };
  if (photo === 'none') return new Response(null, { status: 404, headers });
  return new Response(photo.bytes, {
    headers: {
      ...headers,
      'Content-Type': photo.contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
