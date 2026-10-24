import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookieConfigured, respondJson } from './llm';

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

it('bounds structured extraction to sixty seconds and propagates timeout', async () => {
  vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://example.openai.azure.com');
  vi.stubEnv('AZURE_OPENAI_API_KEY', 'fictional-test-key');
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    expect(init?.signal).toBe(controller.signal);
    throw new DOMException('Timed out', 'TimeoutError');
  });
  try {
    await expect(respondJson('Read', [], { name: 'invoice', schema: {} })).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    expect(timeout).toHaveBeenCalledWith(60_000);
    expect(fetch).toHaveBeenCalledOnce();
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});
