import { getAuthContext } from '@/lib/auth/context';
import { pendingApprovalCount } from '@/lib/email';

export async function GET() {
  const auth = await getAuthContext();
  const count = auth?.user.userType === 'Member' ? await pendingApprovalCount(auth) : 0;
  return Response.json({ count }, { headers: { 'Cache-Control': 'no-store' } });
}
