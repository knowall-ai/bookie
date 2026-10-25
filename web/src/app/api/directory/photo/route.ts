import { z } from 'zod';
import { canManageSettings } from '@/lib/auth/access';
import { getAuthContext } from '@/lib/auth/context';
import { fetchProfilePhoto } from '@/lib/auth/photo';

/**
 * Someone's Microsoft 365 profile photo by address, such as an agent or a shared
 * mailbox in Settings › Email. Read with the signed-in person's own token, so
 * Graph decides what they may see; never stored, cached only in their browser.
 */
const CACHE = 'private, max-age=3600';
const address = z.string().trim().toLowerCase().max(320).email();

export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  // Only Settings › Email shows these, which only members can open, like the directory search.
  if (!canManageSettings(auth.user))
    return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const user = address.safeParse(new URL(request.url).searchParams.get('user'));
  if (!user.success)
    return new Response(null, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const photo = await fetchProfilePhoto(auth, user.data);
  if (photo === 'unavailable')
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const headers = { 'Cache-Control': CACHE, Vary: 'Cookie' };
  if (photo === 'none') return new Response(null, { status: 404, headers });
  return new Response(photo.bytes, {
    headers: { ...headers, 'Content-Type': photo.contentType, 'X-Content-Type-Options': 'nosniff' },
  });
}
