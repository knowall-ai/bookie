import { describe, expect, it } from 'vitest';
import { baselineHeaders, httpsOrigin, pageCsp, resourceCsp, voiceOrigin } from './headers';

function directive(csp: string, name: string) {
  return csp.split('; ').find((d) => d === name || d.startsWith(`${name} `));
}

describe('pageCsp', () => {
  it('allows scripts only by nonce in production, with no inline or eval', () => {
    const csp = pageCsp('abc123');
    expect(directive(csp, 'script-src')).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' https://challenges.cloudflare.com"
    );
    expect(directive(csp, 'script-src')).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('locks down objects, base, forms and framing', () => {
    const csp = pageCsp('n');
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(csp, 'form-action')).toBe("form-action 'self'");
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(csp, 'upgrade-insecure-requests')).toBeDefined();
  });

  it('lets the Turnstile widget and attachment previews load in frames', () => {
    expect(directive(pageCsp('n'), 'frame-src')).toBe(
      "frame-src 'self' https://challenges.cloudflare.com"
    );
  });

  it('keeps connect-src to our origin unless a voice origin is given', () => {
    expect(directive(pageCsp('n'), 'connect-src')).toBe("connect-src 'self'");
    expect(
      directive(pageCsp('n', { voiceOrigin: 'https://contoso.openai.azure.com' }), 'connect-src')
    ).toBe("connect-src 'self' https://contoso.openai.azure.com");
  });

  it("adds 'unsafe-eval' and drops upgrade-insecure-requests only in development", () => {
    const csp = pageCsp('n', { dev: true });
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(csp, 'upgrade-insecure-requests')).toBeUndefined();
  });

  it('never allows arbitrary hosts', () => {
    const csp = pageCsp('n');
    expect(csp).not.toMatch(/(^|\s)(https:|http:|\*)(\s|;|$)/);
  });
});

describe('resourceCsp', () => {
  it('blocks everything, including framing', () => {
    expect(resourceCsp).toBe("default-src 'none'; frame-ancestors 'none'");
  });
});

describe('voiceOrigin', () => {
  it('uses the voice endpoint, then the Azure OpenAI endpoint, as an origin', () => {
    expect(
      voiceOrigin({
        AZURE_VOICE_ENDPOINT: 'https://voice.example.com/some/path/',
        AZURE_OPENAI_ENDPOINT: 'https://chat.example.com',
      })
    ).toBe('https://voice.example.com');
    expect(voiceOrigin({ AZURE_OPENAI_ENDPOINT: 'https://chat.example.com/' })).toBe(
      'https://chat.example.com'
    );
    expect(voiceOrigin({})).toBeUndefined();
  });

  it('ignores anything that is not an https URL', () => {
    expect(httpsOrigin('http://example.com')).toBeUndefined();
    expect(httpsOrigin('not a url')).toBeUndefined();
    expect(httpsOrigin("https://example.com'; script-src *")).toBeUndefined();
  });
});

describe('baselineHeaders', () => {
  it('keeps HSTS, framing and sniffing protection', () => {
    const map = Object.fromEntries(baselineHeaders.map((h) => [h.key, h.value]));
    expect(map['Strict-Transport-Security']).toContain('max-age=63072000');
    expect(map['X-Frame-Options']).toBe('DENY');
    expect(map['X-Content-Type-Options']).toBe('nosniff');
  });
});
