import { z } from 'zod';
import { powBits, turnstileKeys } from '@/lib/public-bookie/config';
import { guard, jsonError, logEvent } from '@/lib/public-bookie/guard';
import { issueChallenge, issuePass, verifyProofOfWork, verifyTurnstile } from '@/lib/public-bookie/pass';
import { limiters } from '@/lib/public-bookie/rate-limit';
import type { PassChallenge } from '@/lib/public-bookie/shared';

export const dynamic = 'force-dynamic';

/** How the widget proves it is a person: Turnstile when configured, else proof-of-work. */
export async function GET(request: Request) {
  const checked = guard(request, { limits: [limiters.challenge] });
  if (!checked.ok) return checked.response;
  const turnstile = turnstileKeys();
  const body: PassChallenge = turnstile
    ? { mode: 'turnstile', siteKey: turnstile.siteKey }
    : { mode: 'pow', challenge: issueChallenge(checked.ip), bits: powBits() };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

const bodySchema = z.union([
  z.object({ turnstileToken: z.string().min(1).max(2048) }),
  z.object({ challenge: z.string().min(1).max(200), nonce: z.string().min(1).max(32) }),
]);

/** Exchanges a solved check for a 30-minute pass. */
export async function POST(request: Request) {
  const checked = guard(request, { limits: [limiters.pass] });
  if (!checked.ok) return checked.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return jsonError(400, 'Invalid request.');

  const turnstile = turnstileKeys();
  let human = false;
  if (turnstile) {
    human =
      'turnstileToken' in parsed.data &&
      (await verifyTurnstile(parsed.data.turnstileToken, turnstile.secret, checked.ip));
  } else if ('challenge' in parsed.data) {
    human = verifyProofOfWork(parsed.data.challenge, parsed.data.nonce, checked.ip, powBits());
  }
  logEvent({ kind: 'pass', ok: human, mode: turnstile ? 'turnstile' : 'pow' });
  if (!human) return jsonError(403, 'Verification failed. Please try again.');
  return Response.json(
    { pass: issuePass(checked.ip), expiresInSeconds: 30 * 60 },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
