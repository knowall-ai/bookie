import { getAuthContext } from '@/lib/auth/context';
import { pendingApprovalCount } from '@/lib/email';

/** `{ count }` for the Email tab's badge; `{ count: null }` when it couldn't be read. */
export async function GET() {
  const auth = await getAuthContext();
  // Signed out, or from an organisation that isn't approved.
  if (!auth)
    return Response.json(
      { error: 'Sign in required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  const count = auth.user.userType === 'Member' ? await pendingApprovalCount(auth) : 0;
  return Response.json({ count: count ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}
