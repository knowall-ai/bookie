import { z } from 'zod';
import { azureHeaders } from '@/lib/bookie/llm';
import { bookieInstructions } from '@/lib/bookie/prompt';
import { bookieContext, rateLimit } from '@/lib/bookie/session';
import { toolsFor } from '@/lib/bookie/tools';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ orgKey: z.string().max(300).optional() });

/**
 * Mints a short-lived client secret for an in-browser realtime voice session
 * with Bookie. The browser talks to Azure OpenAI directly over WebRTC; any tool
 * call comes back through /api/bookie/tool and runs as the signed-in user.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });
  const context = await bookieContext(parsed.data.orgKey);
  if (!context.ok) return Response.json({ error: context.error }, { status: context.status });
  if (!rateLimit(`voice:${context.auth.user.tenantId}:${context.auth.user.id}`, 4)) {
    return Response.json({ error: 'Too many calls. Try again in a minute.' }, { status: 429 });
  }
  const endpoint = (process.env.AZURE_VOICE_ENDPOINT ?? process.env.AZURE_OPENAI_ENDPOINT)?.replace(
    /\/$/,
    ''
  );
  const deployment = process.env.BOOKIE_VOICE_DEPLOYMENT ?? 'gpt-realtime-2.1';
  if (!endpoint)
    return Response.json({ error: 'Voice is not configured on this server.' }, { status: 503 });

  const tools = toolsFor(context.connector);
  const response = await fetch(`${endpoint}/openai/v1/realtime/client_secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await azureHeaders()) },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 120 },
      session: {
        type: 'realtime',
        model: deployment,
        instructions: bookieInstructions(context.org, context.auth.user, 'voice'),
        tools,
        tool_choice: 'auto',
        audio: { output: { voice: process.env.BOOKIE_VOICE ?? 'cedar' } },
      },
    }),
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as {
    value?: string;
    error?: { message?: string };
  };
  if (!response.ok || !body.value) {
    console.error('[bookie] voice session failed', response.status, body.error?.message);
    return Response.json({ error: 'Could not start a voice call with Bookie.' }, { status: 502 });
  }
  return Response.json({
    clientSecret: body.value,
    callsUrl: `${endpoint}/openai/v1/realtime/calls`,
    deployment,
  });
}
