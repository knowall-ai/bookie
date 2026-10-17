import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';
import { recent, subscribe, type LiveEvent } from '@/lib/webhooks/events';
import { liveSource } from '@/lib/webhooks/live';

export const dynamic = 'force-dynamic';

/** What the browser sees: no source key, just the change. */
function publicEvent({ entity, invoiceType, id, event, at }: LiveEvent) {
  return { entity, invoiceType, id, event, at };
}

const HEARTBEAT_MS = 25_000;
/** Close streams after a while; EventSource reconnects and the sign-in is checked again. */
const STREAM_MAX_MS = 10 * 60_000;

/**
 * Live activity for one organisation, from the in-memory webhook buffer.
 * `Accept: text/event-stream` streams (SSE); otherwise JSON, with `?since=`
 * for polling. Only users who can reach the org (re-checked against their own
 * tenant's org list) can read it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const { org } = await params;
  const source = await liveSource(auth, decodeURIComponent(org)).catch(() => undefined);
  if (!source) return NextResponse.json({ error: 'Organisation not found.' }, { status: 404 });
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!source.enabled) return NextResponse.json({ enabled: false, events: [] }, { headers });

  const since = new URL(request.url).searchParams.get('since') ?? undefined;
  if (!request.headers.get('accept')?.includes('text/event-stream')) {
    return NextResponse.json(
      { enabled: true, events: recent(source.key, since).map(publicEvent) },
      { headers }
    );
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send('retry: 5000\n\n');
      send(
        `event: snapshot\ndata: ${JSON.stringify(recent(source.key, since).map(publicEvent))}\n\n`
      );
      const unsubscribe = subscribe(source.key, (event) =>
        send(`data: ${JSON.stringify(publicEvent(event))}\n\n`)
      );
      const heartbeat = setInterval(() => send(': keep-alive\n\n'), HEARTBEAT_MS);
      const stop = setTimeout(() => cleanup(), STREAM_MAX_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        clearTimeout(stop);
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };
      request.signal.addEventListener('abort', () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      ...headers,
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
