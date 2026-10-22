import { getAuthContext } from '@/lib/auth/context';
import { portalAgent } from '@/lib/email';

/** The portal's agent for "Call on Teams", from Settings › Email. Members only; null when unset. */
export async function GET() {
  const auth = await getAuthContext();
  const agent = auth ? ((await portalAgent(auth).catch(() => undefined)) ?? null) : null;
  return Response.json({ agent }, { headers: { 'Cache-Control': 'no-store' } });
}
