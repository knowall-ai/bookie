import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookieConfigured } from './llm';

describe('bookieConfigured', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('needs an Azure OpenAI endpoint', () => {
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', '');
    vi.stubEnv('BOOKIE_DISABLE_AI', '');
    expect(bookieConfigured()).toBe(false);
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://example.openai.azure.com');
    expect(bookieConfigured()).toBe(true);
  });

  it('is off when BOOKIE_DISABLE_AI=1, even with an endpoint', () => {
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://example.openai.azure.com');
    vi.stubEnv('BOOKIE_DISABLE_AI', '1');
    expect(bookieConfigured()).toBe(false);
  });
});
