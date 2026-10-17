import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  allowedOrigins,
  isAzureOpenAiEndpoint,
  publicAzureConfig,
  publicBookieEnabled,
} from './config';

afterEach(() => vi.unstubAllEnvs());

describe('kill switch', () => {
  it('is on by default and off with PUBLIC_BOOKIE_ENABLED=false', () => {
    vi.stubEnv('PUBLIC_BOOKIE_ENABLED', '');
    vi.stubEnv('PUBLIC_BOOKIE_ENABLED', undefined as unknown as string);
    expect(publicBookieEnabled()).toBe(true);
    vi.stubEnv('PUBLIC_BOOKIE_ENABLED', 'false');
    expect(publicBookieEnabled()).toBe(false);
    vi.stubEnv('PUBLIC_BOOKIE_ENABLED', 'FALSE');
    expect(publicBookieEnabled()).toBe(false);
  });
});

describe('publicAzureConfig', () => {
  const portal = {
    AZURE_OPENAI_ENDPOINT: 'https://portal-resource.openai.azure.com',
    AZURE_OPENAI_API_KEY: 'portal-key-0000000000',
  };

  it('uses the PUBLIC_* settings', () => {
    vi.stubEnv('PUBLIC_AZURE_OPENAI_ENDPOINT', 'https://public-resource.openai.azure.com/');
    vi.stubEnv('PUBLIC_AZURE_OPENAI_API_KEY', 'public-key');
    vi.stubEnv('PUBLIC_BOOKIE_CHAT_DEPLOYMENT', 'public-chat');
    vi.stubEnv('PUBLIC_BOOKIE_VOICE_DEPLOYMENT', 'public-voice');
    expect(publicAzureConfig()).toMatchObject({
      endpoint: 'https://public-resource.openai.azure.com',
      apiKey: 'public-key',
      chatDeployment: 'public-chat',
      voiceDeployment: 'public-voice',
      voice: 'cedar',
    });
  });

  it('never falls back to the portal resource in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PUBLIC_AZURE_OPENAI_ENDPOINT', '');
    for (const [k, v] of Object.entries(portal)) vi.stubEnv(k, v);
    expect(publicAzureConfig()).toBeUndefined();
  });

  it('borrows the portal settings in development only, for local testing', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PUBLIC_AZURE_OPENAI_ENDPOINT', '');
    for (const [k, v] of Object.entries(portal)) vi.stubEnv(k, v);
    expect(publicAzureConfig()?.endpoint).toBe(portal.AZURE_OPENAI_ENDPOINT);
  });

  it('only sends keys to Azure OpenAI hosts', () => {
    expect(isAzureOpenAiEndpoint('https://x.openai.azure.com')).toBe(true);
    expect(isAzureOpenAiEndpoint('https://x.cognitiveservices.azure.com')).toBe(true);
    expect(isAzureOpenAiEndpoint('https://evil.example')).toBe(false);
    expect(isAzureOpenAiEndpoint('http://x.openai.azure.com')).toBe(false);
    expect(isAzureOpenAiEndpoint('https://x.openai.azure.com.evil.example')).toBe(false);
    vi.stubEnv('PUBLIC_AZURE_OPENAI_ENDPOINT', 'https://evil.example');
    expect(publicAzureConfig()).toBeUndefined();
  });
});

describe('allowedOrigins', () => {
  it('includes the public sites and configured extras', () => {
    vi.stubEnv('PUBLIC_BOOKIE_ALLOWED_ORIGINS', 'https://staging.example, https://other.example/');
    vi.stubEnv('NEXTAUTH_URL', 'https://getbook.ie/');
    const origins = allowedOrigins();
    expect(origins).toEqual(
      expect.arrayContaining([
        'https://getbook.ie',
        'https://bookie.knowall.ai',
        'https://staging.example',
        'https://other.example',
      ])
    );
    expect(new Set(origins).size).toBe(origins.length);
  });
});
