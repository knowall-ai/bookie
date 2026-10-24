import { getAuthContext } from '@/lib/auth/context';
import { resetDemoData } from '@/lib/connectors/demo/data';
export async function POST() {
  if (process.env.NODE_ENV === 'production' || process.env.BOOKIE_E2E !== '1')
    return new Response(null, { status: 404 });
  const auth = await getAuthContext();
  if (auth?.mode !== 'demo') return new Response(null, { status: 404 });
  resetDemoData('contoso-wholesale');
  return new Response(null, { status: 204 });
}
