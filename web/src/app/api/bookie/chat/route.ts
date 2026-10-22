import { z } from 'zod';
import { bookieConfigured, respond, type ResponseItem } from '@/lib/bookie/llm';
import { bookieInstructions } from '@/lib/bookie/prompt';
import { bookieContext, rateLimit } from '@/lib/bookie/session';
import { bookieToolContext } from '@/lib/bookie/tool-context';
import { runTool, toolsFor, toolStatus } from '@/lib/bookie/tools';
import {
  buildSuggestion,
  MAX_HOME_SUGGESTIONS,
  MAX_SUGGESTIONS,
  suggestToolDefinition,
} from '@/lib/bookie/suggestions';
import type { BookieSuggestion } from '@/lib/bookie/suggestion-types';

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
 *   {type:"message", text, suggestions}  the final answer, with any next steps
 *                           Bookie suggested (cards the user can action)
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
  const tools = connector ? [...toolsFor(connector), suggestToolDefinition] : [];
  const base = org ? `/portal/${encodeURIComponent(org.key)}` : '';
  const suggestions: BookieSuggestion[] = [];
  const toolContext = bookieToolContext(auth, org, connector);

  /** A card for the user, checked against the live record; the result goes back to Bookie. */
  const suggest = async (rawArgs: string) => {
    if (!connector) return { shown: false, error: 'No organisation is open.' };
    const limit = mode === 'insights' ? MAX_HOME_SUGGESTIONS : MAX_SUGGESTIONS;
    if (suggestions.length >= limit)
      return { shown: false, error: `At most ${limit} suggestions per answer.` };
    const result = await buildSuggestion(connector, base, rawArgs);
    if (!result.ok) return { shown: false, error: result.error };
    if (!suggestions.some((s) => s.id === result.suggestion.id))
      suggestions.push(result.suggestion);
    return { shown: true };
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      // Bookie often writes his answer in the same turn as his suggest_action calls, then
      // ends with an empty turn: send the last thing he actually said.
      let answer = '';
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const reply = await respond(
            instructions,
            conversation,
            round < MAX_TOOL_ROUNDS ? tools : undefined
          );
          conversation.push(...reply.output);
          if (reply.text.trim()) answer = reply.text;
          if (reply.calls.length === 0) {
            send({ type: 'message', text: answer, suggestions });
            break;
          }
          for (const call of reply.calls) {
            if (call.name === suggestToolDefinition.name) {
              conversation.push({
                type: 'function_call_output',
                call_id: call.call_id,
                output: JSON.stringify(await suggest(call.arguments)),
              });
              continue;
            }
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
