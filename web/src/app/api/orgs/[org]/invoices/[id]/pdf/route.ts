import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';
import { getConnector } from '@/lib/connectors/registry';
import { isConnectorError } from '@/lib/connectors/types';

/** Streams the invoice PDF exactly as the source system renders it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ org: string; id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const { org, id } = await params;
  try {
    const connector = await getConnector(auth, decodeURIComponent(org));
    const invoice = await connector.invoices?.get(id);
    const bytes = await connector.invoices?.pdf?.(id);
    if (!invoice || !bytes)
      return NextResponse.json({ error: 'No PDF available.' }, { status: 404 });
    const name =
      `${invoice.type === 'sales' ? 'Invoice' : 'Bill'} ${invoice.number || invoice.id}.pdf`.replace(
        /[^\w .-]/g,
        ''
      );
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${name}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const status = isConnectorError(error) ? error.status : 500;
    return NextResponse.json(
      { error: isConnectorError(error) ? error.message : 'Could not load the PDF.' },
      { status }
    );
  }
}
