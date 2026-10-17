import { attachmentResponse } from '@/lib/portal/attachments-proxy';

export const dynamic = 'force-dynamic';

/** Streams one attachment of a document; `?download=1` forces a download. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string; entity: string; id: string; attachmentId: string }> }
) {
  const download = new URL(request.url).searchParams.get('download') === '1';
  return attachmentResponse({ ...(await params), download });
}
