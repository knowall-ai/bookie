import { z } from 'zod';
import { bookieContext, rateLimit } from '@/lib/bookie/session';
import { runTool } from '@/lib/bookie/tools';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  orgKey: z.string().max(300),
  name: z.string().max(64),
  arguments: z.string().max(4000),
});

/** Runs one Bookie tool for the in-browser voice session, as the signed-in user. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });
  const context = await bookieContext(parsed.data.orgKey);
  if (!context.ok) return Response.json({ error: context.error }, { status: context.status });
  if (!rateLimit(`tool:${context.auth.user.tenantId}:${context.auth.user.id}`, 60)) {
    return Response.json({ error: 'Too many lookups. Try again in a minute.' }, { status: 429 });
  }
  return Response.json({
    output: await runTool(context.connector, parsed.data.name, parsed.data.arguments),
  });
}
