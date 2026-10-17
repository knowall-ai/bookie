import { handleBcWebhook } from '@/lib/webhooks/bc';
import { webhookConfig } from '@/lib/webhooks/config';

export const dynamic = 'force-dynamic';

/** Business Central subscription handshake and notifications. See docs/WEBHOOKS.adoc. */
export async function POST(request: Request) {
  return handleBcWebhook(request, webhookConfig().secret);
}

export async function GET(request: Request) {
  return handleBcWebhook(request, webhookConfig().secret);
}
