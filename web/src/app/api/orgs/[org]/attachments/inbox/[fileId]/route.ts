import { inboxFileResponse } from '@/lib/portal/attachments-proxy';

export const dynamic = 'force-dynamic';

/** Streams one file from the organisation's capture inbox (Xero Files › Inbox). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string; fileId: string }> }
) {
  const download = new URL(request.url).searchParams.get('download') === '1';
  return inboxFileResponse({ ...(await params), download });
}
