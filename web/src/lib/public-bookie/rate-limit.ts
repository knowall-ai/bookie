/**
 * In-memory fixed-window rate limiter with several windows per key (per
 * minute, per hour, per day...). A request is allowed only if every window has
 * room, and only then counted in all of them.
 *
 * Limits are per server instance. App Service runs Bookie on one instance; if
 * it is scaled out, the effective limit is the configured limit times the
 * instance count (documented in docs/PUBLIC_ASSISTANT.adoc). The Azure
 * deployment's own token-per-minute quota is the final, global ceiling.
 */
export interface Window {
  limit: number;
  ms: number;
}

export interface LimitResult {
  ok: boolean;
  /** Milliseconds until the blocking window resets (0 when allowed). */
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, { start: number; count: number }[]>();

  constructor(
    private readonly windows: Window[],
    private readonly maxKeys = 50_000
  ) {}

  hit(key: string, now = Date.now()): LimitResult {
    const slots = this.hits.get(key) ?? this.windows.map(() => ({ start: now, count: 0 }) as const);
    const fresh = slots.map((slot, i) =>
      now - slot.start >= this.windows[i].ms ? { start: now, count: 0 } : { ...slot }
    );
    let retryAfterMs = 0;
    fresh.forEach((slot, i) => {
      if (slot.count >= this.windows[i].limit) {
        retryAfterMs = Math.max(retryAfterMs, slot.start + this.windows[i].ms - now);
      }
    });
    if (retryAfterMs > 0) {
      this.hits.set(key, fresh);
      return { ok: false, retryAfterMs };
    }
    fresh.forEach((slot) => (slot.count += 1));
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) this.prune(now);
    this.hits.set(key, fresh);
    return { ok: true, retryAfterMs: 0 };
  }

  /** Drop keys whose every window has expired; if still full, drop the oldest. */
  private prune(now: number) {
    for (const [key, slots] of this.hits) {
      if (slots.every((slot, i) => now - slot.start >= this.windows[i].ms)) this.hits.delete(key);
    }
    while (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }

  get size() {
    return this.hits.size;
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const envInt = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

/**
 * The documented limits. Per IP unless marked global. Two global daily caps
 * can be tuned without a code change.
 */
export const LIMITS = {
  challengePerIp: [
    { limit: 20, ms: MINUTE },
    { limit: 100, ms: HOUR },
  ],
  passPerIp: [
    { limit: 6, ms: MINUTE },
    { limit: 30, ms: HOUR },
  ],
  chatPerIp: [
    { limit: 10, ms: MINUTE },
    { limit: 60, ms: HOUR },
    { limit: 150, ms: DAY },
  ],
  chatGlobal: [
    { limit: 120, ms: MINUTE },
    { limit: envInt('PUBLIC_BOOKIE_CHAT_DAILY_CAP', 3000), ms: DAY },
  ],
  voicePerIp: [
    { limit: 2, ms: MINUTE },
    { limit: 6, ms: HOUR },
    { limit: 10, ms: DAY },
  ],
  voiceGlobal: [
    { limit: 20, ms: HOUR },
    { limit: envInt('PUBLIC_BOOKIE_VOICE_DAILY_CAP', 100), ms: DAY },
  ],
  /** Calls running at once, across all visitors. */
  voiceConcurrent: envInt('PUBLIC_BOOKIE_VOICE_MAX_CONCURRENT', 5),
} satisfies Record<string, Window[] | number>;

export const limiters = {
  challenge: new RateLimiter(LIMITS.challengePerIp),
  pass: new RateLimiter(LIMITS.passPerIp),
  chat: new RateLimiter(LIMITS.chatPerIp),
  chatGlobal: new RateLimiter(LIMITS.chatGlobal),
  voice: new RateLimiter(LIMITS.voicePerIp),
  voiceGlobal: new RateLimiter(LIMITS.voiceGlobal),
};
