import { z } from 'zod';
import { publicChat, UpstreamError } from '@/lib/public-bookie/azure';
import { publicAiDisabled, publicAzureConfig } from '@/lib/public-bookie/config';
import { globalLimit, guard, jsonError, logEvent } from '@/lib/public-bookie/guard';
import { signReply, verifyReply } from '@/lib/public-bookie/pass';
import { DECLINE_REPLY, OFFLINE_REPLY } from '@/lib/public-bookie/prompt';
import { limiters } from '@/lib/public-bookie/rate-limit';
import { leaksPrompt, sanitizeReply } from '@/lib/public-bookie/sanitize';
import { PUBLIC_LIMITS } from '@/lib/public-bookie/shared';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
        sig: z.string().max(64).optional(),
      })
    )
    .min(1)
    .max(PUBLIC_LIMITS.maxMessages),
});

// Control characters other than tab and newline.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/**
 * Text chat with Bookie's public helper. Stateless: the widget sends the
 * conversation each time; Bookie's earlier replies only count if they carry
 * the server's signature, so a visitor cannot put words in his mouth.
 */
export async function POST(request: Request) {
  const checked = guard(request, { pass: true, limits: [limiters.chat] });
  if (!checked.ok) return checked.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return jsonError(400, 'Invalid request.');
  const { messages } = parsed.data;
  const last = messages[messages.length - 1];
  if (last.role !== 'user') return jsonError(400, 'Invalid request.');
  if (messages.some((m) => m.role === 'user' && m.content.length > PUBLIC_LIMITS.maxMessageChars)) {
    return jsonError(400, `Please keep messages under ${PUBLIC_LIMITS.maxMessageChars} characters.`);
  }

  const turns = messages
    .filter((m) => m.role === 'user' || verifyReply(m.content, m.sig))
    .map((m) => ({ role: m.role, content: m.content.replace(CONTROL, '') }));

  const started = Date.now();
  if (publicAiDisabled()) {
    logEvent({ kind: 'chat', ok: true, offline: true, turns: turns.length });
    return reply(OFFLINE_REPLY);
  }
  const config = publicAzureConfig();
  if (!config) return jsonError(503, "Bookie's public helper is not configured.");
  const busy = globalLimit(limiters.chatGlobal);
  if (busy) return busy;

  try {
    const raw = await publicChat(config, turns);
    const leaked = leaksPrompt(raw);
    const text = leaked || !raw.trim() ? DECLINE_REPLY : sanitizeReply(raw);
    logEvent({ kind: 'chat', ok: true, turns: turns.length, ms: Date.now() - started, leaked });
    return reply(text);
  } catch (err) {
    // Azure's content filter refusing a prompt is a decline, not an outage.
    if (err instanceof UpstreamError && err.code === 'content_filter') {
      logEvent({ kind: 'chat', ok: true, filtered: true, turns: turns.length });
      return reply(DECLINE_REPLY);
    }
    logEvent({
      kind: 'chat',
      ok: false,
      status: err instanceof UpstreamError ? err.status : undefined,
      code: err instanceof UpstreamError ? err.code : 'exception',
    });
    return jsonError(502, 'Bookie could not answer just now. Please try again.');
  }
}

function reply(text: string) {
  return Response.json({ reply: text, sig: signReply(text) }, { headers: { 'Cache-Control': 'no-store' } });
}
