import 'server-only';

/**
 * Configuration for the public Bookie helper on the marketing site.
 *
 * It has its OWN Azure OpenAI settings (PUBLIC_*), separate from the portal
 * Bookie and the Teams agent, so a key leaked from the public side can never
 * reach their deployments. Only in development, and only when no PUBLIC_*
 * endpoint is set, does it borrow the portal's local settings so the widget
 * can be tried on a laptop. Production never falls back.
 */

export interface PublicAzureConfig {
  endpoint: string;
  /** Undefined: use managed identity (Cognitive Services OpenAI User on the public resource). */
  apiKey?: string;
  chatDeployment: string;
  voiceDeployment: string;
  voice: string;
}

const isProduction = () => process.env.NODE_ENV === 'production';

/** Kill switch: PUBLIC_BOOKIE_ENABLED=false hides the widget and makes every route return 503. */
export function publicBookieEnabled(): boolean {
  return (process.env.PUBLIC_BOOKIE_ENABLED ?? 'true').toLowerCase() !== 'false';
}

/** BOOKIE_DISABLE_AI=1 (end-to-end tests): no model calls; chat answers from a canned reply. */
export function publicAiDisabled(): boolean {
  return process.env.BOOKIE_DISABLE_AI === '1';
}

/** Only Azure OpenAI hosts may receive the key. */
export function isAzureOpenAiEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      /\.(openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)$/.test(
        url.hostname
      )
    );
  } catch {
    return false;
  }
}

export function publicAzureConfig(): PublicAzureConfig | undefined {
  let endpoint = process.env.PUBLIC_AZURE_OPENAI_ENDPOINT;
  let apiKey = process.env.PUBLIC_AZURE_OPENAI_API_KEY || undefined;
  let chat = process.env.PUBLIC_BOOKIE_CHAT_DEPLOYMENT;
  let voiceDeployment = process.env.PUBLIC_BOOKIE_VOICE_DEPLOYMENT;
  if (!endpoint && !isProduction()) {
    // Local testing only: reuse the developer's portal settings from .env.local.
    endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    apiKey = process.env.AZURE_OPENAI_API_KEY || undefined;
    chat ??= process.env.BOOKIE_CHAT_DEPLOYMENT;
    voiceDeployment ??= process.env.BOOKIE_VOICE_DEPLOYMENT;
  }
  if (!endpoint || !isAzureOpenAiEndpoint(endpoint)) return undefined;
  return {
    endpoint: endpoint.replace(/\/$/, ''),
    apiKey,
    chatDeployment: chat ?? 'gpt-6.1-sol',
    voiceDeployment: voiceDeployment ?? 'gpt-realtime-2.1',
    voice: process.env.PUBLIC_BOOKIE_VOICE ?? 'cedar',
  };
}

/** Site origins allowed to call /api/public/*. */
export function allowedOrigins(): string[] {
  const list = [
    'https://getbook.ie',
    'https://www.getbook.ie',
    'https://bookie.knowall.ai',
    ...(process.env.PUBLIC_BOOKIE_ALLOWED_ORIGINS ?? '').split(','),
  ];
  for (const url of [process.env.NEXTAUTH_URL, process.env.BOOKIE_SITE_URL]) {
    if (!url) continue;
    try {
      list.push(new URL(url).origin);
    } catch {
      // Ignore a malformed setting rather than allow everything.
    }
  }
  return [...new Set(list.map((o) => o.trim().replace(/\/$/, '')).filter(Boolean))];
}

/** Development accepts any localhost port so the dev server and e2e servers work. */
export function allowLocalhostOrigins(): boolean {
  return !isProduction();
}

/** Turnstile is used when both keys are set; otherwise the proof-of-work check. */
export function turnstileKeys(): { siteKey: string; secret: string } | undefined {
  const siteKey = process.env.PUBLIC_TURNSTILE_SITE_KEY;
  const secret = process.env.TURNSTILE_SECRET;
  return siteKey && secret ? { siteKey, secret } : undefined;
}

/** Proof-of-work difficulty in leading zero bits (about 2^bits SHA-256 hashes in the browser). */
export function powBits(): number {
  const bits = Number(process.env.PUBLIC_BOOKIE_POW_BITS ?? 16);
  return Number.isInteger(bits) && bits >= 8 && bits <= 24 ? bits : 16;
}

/** Header carrying the real client IP, if a trusted proxy (e.g. Cloudflare) sets one. */
export function clientIpHeader(): string | undefined {
  return process.env.PUBLIC_BOOKIE_CLIENT_IP_HEADER?.toLowerCase() || undefined;
}
