import { describe, expect, it } from 'vitest';
import { LIMITS, RateLimiter } from './rate-limit';

describe('RateLimiter', () => {
  it('allows up to the limit in a window, then blocks with a retry time', () => {
    const limiter = new RateLimiter([{ limit: 3, ms: 60_000 }]);
    const t = 1_000_000;
    expect([1, 2, 3].map(() => limiter.hit('a', t).ok)).toEqual([true, true, true]);
    const blocked = limiter.hit('a', t + 10_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(50_000);
  });

  it('keys are independent', () => {
    const limiter = new RateLimiter([{ limit: 1, ms: 60_000 }]);
    expect(limiter.hit('a', 0).ok).toBe(true);
    expect(limiter.hit('b', 0).ok).toBe(true);
    expect(limiter.hit('a', 0).ok).toBe(false);
  });

  it('resets after the window', () => {
    const limiter = new RateLimiter([{ limit: 1, ms: 1_000 }]);
    expect(limiter.hit('a', 0).ok).toBe(true);
    expect(limiter.hit('a', 999).ok).toBe(false);
    expect(limiter.hit('a', 1_000).ok).toBe(true);
  });

  it('enforces every window: a daily cap holds even when the minute has room', () => {
    const limiter = new RateLimiter([
      { limit: 2, ms: 60_000 },
      { limit: 3, ms: 86_400_000 },
    ]);
    expect(limiter.hit('a', 0).ok).toBe(true);
    expect(limiter.hit('a', 1).ok).toBe(true);
    expect(limiter.hit('a', 2).ok).toBe(false); // minute full
    expect(limiter.hit('a', 60_000).ok).toBe(true); // new minute
    const day = limiter.hit('a', 120_000);
    expect(day.ok).toBe(false); // day full
    expect(day.retryAfterMs).toBe(86_400_000 - 120_000);
  });

  it('blocked requests are not counted', () => {
    const limiter = new RateLimiter([{ limit: 1, ms: 1_000 }]);
    limiter.hit('a', 0);
    for (let i = 0; i < 10; i++) limiter.hit('a', 10);
    expect(limiter.hit('a', 1_000).ok).toBe(true);
  });

  it('stays bounded in memory', () => {
    const limiter = new RateLimiter([{ limit: 1, ms: 1_000 }], 100);
    for (let i = 0; i < 1_000; i++) limiter.hit(`ip-${i}`, i);
    expect(limiter.size).toBeLessThanOrEqual(100);
  });

  it('documented limits are sensible', () => {
    expect(LIMITS.chatPerIp[0]).toEqual({ limit: 10, ms: 60_000 });
    expect(LIMITS.voicePerIp.at(-1)?.limit).toBe(10);
    expect(LIMITS.voiceConcurrent).toBeGreaterThan(0);
  });
});
