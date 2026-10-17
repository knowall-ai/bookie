/**
 * Webhook settings, all from the environment (never stored):
 *
 * - XERO_WEBHOOK_KEY: the webhook key from Bookie's app in the Xero developer
 *   portal. Without it /api/webhooks/xero answers 401 to everything.
 * - BOOKIE_WEBHOOK_SECRET: signs Business Central subscriptions' clientState.
 * - BOOKIE_PUBLIC_URL (falls back to NEXTAUTH_URL): Bookie's public HTTPS
 *   address, used to build BC's notification URL.
 * - BOOKIE_LIVE_FEED=off hides the Home page's Live panel everywhere.
 */
export interface WebhookConfig {
  xeroKey?: string;
  secret?: string;
  /** `https://…/api/webhooks/bc`, or undefined when Bookie has no public HTTPS address. */
  bcNotificationUrl?: string;
  liveFeedOff: boolean;
}

export function webhookConfig(
  env: Record<string, string | undefined> = process.env
): WebhookConfig {
  const publicUrl = (env.BOOKIE_PUBLIC_URL || env.NEXTAUTH_URL || '').trim().replace(/\/+$/, '');
  let bcNotificationUrl: string | undefined;
  try {
    const url = new URL(`${publicUrl}/api/webhooks/bc`);
    // BC can only call public HTTPS endpoints.
    if (url.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(url.hostname)) {
      bcNotificationUrl = url.toString();
    }
  } catch {
    bcNotificationUrl = undefined;
  }
  return {
    xeroKey: env.XERO_WEBHOOK_KEY?.trim() || undefined,
    secret: env.BOOKIE_WEBHOOK_SECRET?.trim() || undefined,
    bcNotificationUrl,
    liveFeedOff: env.BOOKIE_LIVE_FEED?.trim().toLowerCase() === 'off',
  };
}

/** Whether Business Central live updates can be switched on in this deployment. */
export function bcWebhooksConfigured(config = webhookConfig()): boolean {
  return !!config.secret && !!config.bcNotificationUrl;
}
