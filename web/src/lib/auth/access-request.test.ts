import { describe, expect, it } from 'vitest';
import { accessRequestMailto } from './access-request';

describe('access request email', () => {
  it('pre-fills the subject and the app, organisation, tenant id and email', () => {
    const url = new URL(
      accessRequestMailto({
        organisation: 'Fabrikam, Inc.',
        tenantId: '00000000-0000-0000-0000-00000000fab1',
        email: 'casey.rivera@fabrikam.example',
      })
    );
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('hello@knowall.ai');
    expect(url.searchParams.get('subject')).toBe('Bookie access request');
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('Please could you set up our organisation on Bookie?');
    expect(body).toContain('App: Bookie');
    expect(body).toContain('Organisation: Fabrikam, Inc.');
    expect(body).toContain('Tenant ID: 00000000-0000-0000-0000-00000000fab1');
    expect(body).toContain('Email: casey.rivera@fabrikam.example');
  });

  it('encodes spaces as %20 so mail apps never show plus signs', () => {
    expect(accessRequestMailto({})).not.toContain('+');
    expect(accessRequestMailto({})).toContain('Organisation%3A%20Unknown');
  });
});
