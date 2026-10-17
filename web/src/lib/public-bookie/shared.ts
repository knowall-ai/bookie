/**
 * Limits shared by the public Bookie widget (browser) and its /api/public routes.
 * No secrets and no server imports: this file is bundled into the public site.
 */
export const PUBLIC_LIMITS = {
  /** Longest single visitor message, in characters. */
  maxMessageChars: 600,
  /** Longest conversation sent back to the model: visitor plus Bookie messages. */
  maxMessages: 20,
  /** Hard cap on a voice call, in seconds (the server hangs up; the widget counts down). */
  voiceMaxSeconds: 300,
} as const;

export const PUBLIC_NOTICE =
  "This is Bookie's public helper. It can't see anyone's accounts. Don't share personal or financial details.";

export interface PublicChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Server signature on Bookie's replies, so a forged "assistant" turn is dropped. */
  sig?: string;
}

/** What GET /api/public/pass hands the widget: how to prove it is a person. */
export type PassChallenge =
  { mode: 'turnstile'; siteKey: string } | { mode: 'pow'; challenge: string; bits: number };
