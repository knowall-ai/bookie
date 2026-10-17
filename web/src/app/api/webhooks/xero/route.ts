import { handleXeroWebhook } from '@/lib/webhooks/xero';
import { webhookConfig } from '@/lib/webhooks/config';

export const dynamic = 'force-dynamic';

/** Xero webhook deliveries, including the "Intent to receive" check. See docs/WEBHOOKS.adoc. */
export async function POST(request: Request) {
  return handleXeroWebhook(request, webhookConfig().xeroKey);
}
