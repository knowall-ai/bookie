import { z } from 'zod';
import { bookieConfigured, respond, type ResponseItem } from '@/lib/bookie/llm';
import { bookieInstructions } from '@/lib/bookie/prompt';
import { bookieContext, rateLimit } from '@/lib/bookie/session';
import { bookieToolContext } from '@/lib/bookie/tool-context';
import { runTool, toolsFor, toolStatus } from '@/lib/bookie/tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const bodySchema = z.object({
  orgKey: z.string().max(300).optional(),
  mode: z.enum(['chat', 'insights']).default('chat'),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) }))
    .max(40)
    .default([]),
});

const MAX_TOOL_ROUNDS = 6;

/**
 * Chat with Bookie. Streams server-sent events:
 *   {type:"status", text}   while tools run
 *   {type:"message", text}  the final answer
 *   {type:"error", text}
 * Conversations are not stored on the server; the browser keeps the history.
 */
export async function POST(request: Request) {
  if (!bookieConfigured()) {
    return Response.json({ error: 'Bookie is not configured on this server.' }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });
  const { orgKey, mode, messages } = parsed.data;

  const context = await bookieContext(orgKey);
  if (!context.ok) return Response.json({ error: context.error }, { status: context.status });
  const { auth, org, connector } = context;
  if (!rateLimit(`${auth.user.tenantId}:${auth.user.id}`, mode === 'insights' ? 6 : 20)) {
    return Response.json(
      { error: 'Bookie needs a breather. Try again in a minute.' },
      { status: 429 }
    );
  }

  const instructions = bookieInstructions(org, auth.user, mode);
  const conversation: ResponseItem[] =
    mode === 'insights'
      ? [{ role: 'user', content: 'What should I know about these books today?' }]
      : messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
  const tools = toolsFor(connector);
  const toolContext = bookieToolContext(auth, org);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const reply = await respond(
            instructions,
            conversation,
            round < MAX_TOOL_ROUNDS ? tools : undefined
          );
          conversation.push(...reply.output);
          if (reply.calls.length === 0) {
            send({ type: 'message', text: reply.text });
            break;
          }
          for (const call of reply.calls) {
            send({ type: 'status', text: toolStatus(call.name, call.arguments) });
            conversation.push({
              type: 'function_call_output',
              call_id: call.call_id,
              output: await runTool(connector, call.name, call.arguments, toolContext),
            });
          }
        }
      } catch (error) {
        console.error('[bookie] chat failed', error);
        send({ type: 'error', text: 'Bookie could not answer just now. Please try again.' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
