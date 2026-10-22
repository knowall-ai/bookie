import { getAuthContext } from '@/lib/auth/context';
import { pendingApprovalCount } from '@/lib/email';

/** `{ count }` for the Email tab's badge; `{ count: null }` when it couldn't be read. */
export async function GET() {
  const auth = await getAuthContext();
  const count = auth?.user.userType === 'Member' ? await pendingApprovalCount(auth) : 0;
  return Response.json({ count: count ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}
