import { z } from 'zod';
import { startVoiceCall, superviseCall, UpstreamError } from '@/lib/public-bookie/azure';
import { publicAiDisabled, publicAzureConfig } from '@/lib/public-bookie/config';
import { globalLimit, guard, jsonError, logEvent } from '@/lib/public-bookie/guard';
import { LIMITS, limiters } from '@/lib/public-bookie/rate-limit';
import { PUBLIC_LIMITS } from '@/lib/public-bookie/shared';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ sdp: z.string().startsWith('v=').max(20_000) });

let activeCalls = 0;

/**
 * Starts a voice call with Bookie's public helper. The browser sends its
 * WebRTC offer; the server mints a 30-second client secret, places the call
 * with it and returns only the SDP answer, so no credential ever reaches the
 * browser. Audio then flows browser <-> Azure OpenAI directly. The server
 * watches the call and hangs up after PUBLIC_LIMITS.voiceMaxSeconds, or at
 * once if the session is tampered with.
 */
export async function POST(request: Request) {
  const checked = guard(request, { pass: true, limits: [limiters.voice] });
  if (!checked.ok) return checked.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return jsonError(400, 'Invalid request.');

  const config = publicAzureConfig();
  if (publicAiDisabled() || !config) return jsonError(503, 'Voice is not available right now.');
  if (activeCalls >= LIMITS.voiceConcurrent) {
    return jsonError(503, 'Bookie is on other calls. Please try again shortly, or type instead.');
  }
  const busy = globalLimit(limiters.voiceGlobal);
  if (busy) return busy;

  activeCalls += 1;
  const started = Date.now();
  try {
    const { answerSdp, callId } = await startVoiceCall(config, parsed.data.sdp);
    logEvent({ kind: 'voice', ok: true, active: activeCalls });
    void superviseCall(config, callId).then((reason) => {
      activeCalls -= 1;
      logEvent({ kind: 'voice-end', reason, seconds: Math.round((Date.now() - started) / 1000) });
    });
    return Response.json(
      { sdp: answerSdp, maxSeconds: PUBLIC_LIMITS.voiceMaxSeconds },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    activeCalls -= 1;
    logEvent({
      kind: 'voice',
      ok: false,
      status: err instanceof UpstreamError ? err.status : undefined,
    });
    return jsonError(502, 'Bookie could not pick up. Please try again, or type instead.');
  }
}
