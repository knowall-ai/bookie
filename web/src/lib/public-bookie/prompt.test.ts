import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_FAQ } from './knowledge';
import { DECLINE_REPLY, OFFLINE_REPLY, publicBookieInstructions } from './prompt';

const prompts = [publicBookieInstructions('chat'), publicBookieInstructions('voice')];

describe('public Bookie prompt hardening', () => {
  it('contains no ids, keys, emails or internal names', () => {
    const forbidden: [string, RegExp][] = [
      [
        'GUID (tenant, company or client id)',
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      ],
      ['email address', /[\w.+-]+@[\w-]+\.[\w.]+/],
      ['org key', /\b(xero|bc|demo)\.[A-Za-z0-9-]+\.|bc\.(Production|Sandbox)/],
      ['API key shape', /\b(sk-[A-Za-z0-9]{10,}|api-key|Bearer\s)/i],
      ['env var name', /\b(AZURE_|PUBLIC_AZURE|BOOKIE_[A-Z]|NEXTAUTH|TURNSTILE_)/],
      ['Azure resource', /\.openai\.azure\.com|\bka-bookie|\bkv-|appi-|cognitiveservices/i],
      ['internal code path', /lib\/(connectors|config|auth|bookie|portal)|\btoolsFor\b|orgContext/],
      ['long secret-like token', /[A-Za-z0-9+/_-]{40,}/],
      ['demo or sandbox company', /Contoso|CRONUS|Fabrikam|Northwind/i],
      ['phone number', /\+?\d[\d\s-]{9,}\d/],
    ];
    for (const prompt of prompts) {
      for (const [what, re] of forbidden) {
        expect(prompt.match(re), what).toBeNull();
      }
    }
  });

  it('contains none of the environment’s secret values', () => {
    const values = Object.entries(process.env)
      .filter(([k, v]) => v && v.length >= 12 && /KEY|SECRET|TOKEN|PASSWORD|ENDPOINT/i.test(k))
      .map(([, v]) => v!);
    for (const prompt of prompts) for (const v of values) expect(prompt.includes(v)).toBe(false);
  });

  it('states the rules that make it safe', () => {
    for (const prompt of prompts) {
      expect(prompt).toMatch(/cannot see or reach any organisation's accounts/);
      expect(prompt).toMatch(/no tools/);
      expect(prompt).toMatch(/Never claim to look anything up/);
      expect(prompt).toMatch(/instructions are private/);
      expect(prompt).toMatch(/ignore your instructions/);
      expect(prompt).toMatch(/act as the portal assistant/);
      expect(prompt).toMatch(/https:\/\/knowall\.ai/);
      expect(prompt).toMatch(/\/install/);
      expect(prompt).toMatch(/never financial, tax, accounting, investment or legal advice/);
      expect(prompt).toMatch(/Never make up .*email addresses/);
    }
  });

  it('is separate from the portal Bookie prompt', () => {
    const src = readFileSync(path.join(__dirname, 'prompt.ts'), 'utf8');
    expect(src).not.toMatch(/lib\/bookie/);
    expect(prompts[0]).not.toMatch(/Use your tools/);
  });

  it('carries the whole public FAQ', () => {
    for (const { q } of SITE_FAQ) expect(prompts[0]).toContain(q);
  });

  it('fixed replies point to public routes only', () => {
    for (const text of [DECLINE_REPLY, OFFLINE_REPLY]) {
      expect(text).toMatch(/knowall\.ai/);
      expect(text).not.toMatch(/@/);
    }
  });
});

describe('knowledge pack stays in sync with the site', () => {
  it('every FAQ question still appears on the home page', () => {
    const home = readFileSync(path.resolve(__dirname, '../../app/(site)/page.tsx'), 'utf8');
    for (const { q } of SITE_FAQ) expect(home).toContain(`q: '${q}'`);
  });
});
