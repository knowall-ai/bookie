import { describe, expect, it } from 'vitest';
import {
  editDistance,
  lookalikeOf,
  mailTrustFacts,
  registrableDomain,
  trustVerdict,
  type MailHeaders,
} from './trust';

const auth = (domain: string, result = 'pass') => ({
  name: 'Authentication-Results',
  value: `mx.microsoft.com; spf=${result} smtp.mailfrom=${domain}; dkim=${result} header.d=${domain}; dmarc=${result} action=none header.from=${domain}; compauth=${result} reason=100`,
});

const message = (from: string, headers: MailHeaders['internetMessageHeaders'], replyTo?: string) =>
  ({
    from: { emailAddress: { address: from } },
    sender: { emailAddress: { address: from } },
    replyTo: replyTo ? [{ emailAddress: { address: replyTo } }] : [],
    internetMessageHeaders: headers,
  }) satisfies MailHeaders;

const context = {
  supplierDomains: ['contoso.example.com', 'fabrikam.co.uk'],
  ownDomains: ['northwind.example'],
};

describe('mailTrustFacts (port of mail-trust.mjs)', () => {
  it("reads only Exchange Online's own Authentication-Results", () => {
    const facts = mailTrustFacts(
      message('billing@contoso.example.com', [
        // A sender-added header claiming a pass is ignored.
        { name: 'Authentication-Results', value: 'evil.example; dmarc=pass; compauth=pass' },
        auth('contoso.example.com', 'fail'),
      ])
    );
    expect(facts.dmarc).toBe('fail');
    expect(facts.compositeAuth).toBe('fail');
    expect(facts.exchangeVerdictPresent).toBe(true);
    expect(facts.authenticated).toBe(false);
  });

  it('treats a message with only a forged header as having no verdict', () => {
    const facts = mailTrustFacts(
      message('a@contoso.example.com', [
        { name: 'Authentication-Results', value: 'mx.attacker.example; dmarc=pass' },
      ])
    );
    expect(facts.exchangeVerdictPresent).toBe(false);
    expect(facts.dmarc).toBe('none');
  });

  it("reads Microsoft's SCL and CAT flags", () => {
    const spam = mailTrustFacts(
      message('a@x.example', [
        { name: 'X-Forefront-Antispam-Report', value: 'CIP:1.2.3.4;SCL:6;CAT:SPM;' },
      ])
    );
    expect(spam.spamConfidence).toBe(6);
    expect(spam.flaggedByMicrosoft).toBe(true);
    const phish = mailTrustFacts(
      message('a@x.example', [{ name: 'X-Forefront-Antispam-Report', value: 'SCL:1;CAT:PHSH;' }])
    );
    expect(phish.flaggedByMicrosoft).toBe(true);
    const clean = mailTrustFacts(
      message('a@x.example', [{ name: 'X-Forefront-Antispam-Report', value: 'SCL:1;CAT:NONE;' }])
    );
    expect(clean.flaggedByMicrosoft).toBe(false);
  });

  it('counts compauth pass with SPF or DKIM pass as authenticated, like the script', () => {
    const facts = mailTrustFacts(
      message('a@contoso.example.com', [
        {
          name: 'Authentication-Results',
          value:
            'mx.microsoft.com; spf=pass; dkim=none; dmarc=bestguesspass; compauth=pass reason=109',
        },
      ])
    );
    expect(facts.authenticated).toBe(true);
  });
});

describe('lookalike domains', () => {
  it('finds the registrable domain', () => {
    expect(registrableDomain('billing.contoso.co.uk')).toBe('contoso.co.uk');
    expect(registrableDomain('mail.fabrikam.com')).toBe('fabrikam.com');
  });

  it('flags swapped letters, digits for letters, rn for m, other TLDs and bait words', () => {
    const known = ['contoso.com', 'fabrikam.co.uk', 'northwind.com'];
    expect(lookalikeOf('c0ntoso.com', known)).toBe('contoso.com');
    expect(lookalikeOf('contosso.com', known)).toBe('contoso.com');
    expect(lookalikeOf('contoso.co', known)).toBe('contoso.com');
    expect(lookalikeOf('contoso-billing.com', known)).toBe('contoso.com');
    expect(lookalikeOf('fabrlkam.co.uk', known)).toBe('fabrikam.co.uk');
    expect(lookalikeOf('northwlnd.com', known)).toBe('northwind.com');
    expect(lookalikeOf('nortvvind.com', known)).toBe('northwind.com');
  });

  it('does not flag the real domain, its subdomains or unrelated names', () => {
    const known = ['contoso.com'];
    expect(lookalikeOf('contoso.com', known)).toBeUndefined();
    expect(lookalikeOf('billing.contoso.com', known)).toBeUndefined();
    expect(lookalikeOf('wingtip.com', known)).toBeUndefined();
    expect(lookalikeOf('adatum.com', known)).toBeUndefined();
  });

  it('never flags a domain we already know as a lookalike of another known one', () => {
    const known = ['contoso.co.uk', 'contoso.com', 'boots.example', 'boost.example'];
    expect(lookalikeOf('contoso.com', known)).toBeUndefined();
    expect(lookalikeOf('mail.contoso.co.uk', known)).toBeUndefined();
    expect(lookalikeOf('boost.example', known)).toBeUndefined();
    expect(lookalikeOf('b00ts.example', known)).toBe('boots.example');
  });

  it('computes edit distance with transpositions', () => {
    expect(editDistance('contoso', 'cnotoso')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
  });

  it('flags a lookalike of rn for m', () => {
    expect(lookalikeOf('rnicrosoft.com', ['microsoft.com'])).toBe('microsoft.com');
  });
});

describe('trustVerdict', () => {
  it('trusts authenticated mail from a known contact domain', () => {
    const v = trustVerdict(
      mailTrustFacts(message('ap@billing.contoso.example.com', [auth('contoso.example.com')])),
      context
    );
    expect(v.level).toBe('trusted');
  });

  it('is suspicious on DMARC fail', () => {
    const v = trustVerdict(
      mailTrustFacts(message('ap@contoso.example.com', [auth('contoso.example.com', 'fail')])),
      context
    );
    expect(v.level).toBe('suspicious');
    expect(v.reasons).toContain('DMARC fail');
  });

  it('is suspicious from a lookalike, even when it authenticates', () => {
    const v = trustVerdict(
      mailTrustFacts(message('ap@fabrikarn.co.uk', [auth('fabrikarn.co.uk')])),
      context
    );
    expect(v.level).toBe('suspicious');
    expect(v.reasons.join()).toMatch(/looks like fabrikam\.co\.uk/);
  });

  it("is suspicious when replies go to another domain, but not to the sender's own subdomain", () => {
    const other = trustVerdict(
      mailTrustFacts(
        message('ap@contoso.example.com', [auth('contoso.example.com')], 'pay@quick.example')
      ),
      context
    );
    expect(other.level).toBe('suspicious');
    const own = trustVerdict(
      mailTrustFacts(
        message(
          'ap@contoso.example.com',
          [auth('contoso.example.com')],
          'ar@billing.contoso.example.com'
        )
      ),
      context
    );
    expect(own.level).toBe('trusted');
  });

  it('is suspicious when Microsoft flagged it', () => {
    const v = trustVerdict(
      mailTrustFacts(
        message('ap@contoso.example.com', [
          auth('contoso.example.com'),
          { name: 'X-Forefront-Antispam-Report', value: 'SCL:5;CAT:SPOOF;' },
        ])
      ),
      context
    );
    expect(v.level).toBe('suspicious');
  });

  it('is unverified from an unknown domain or with no Exchange verdict', () => {
    expect(
      trustVerdict(
        mailTrustFacts(message('hi@wingtip.example', [auth('wingtip.example')])),
        context
      ).level
    ).toBe('unverified');
    expect(trustVerdict(mailTrustFacts(message('ap@contoso.example.com', [])), context).level).toBe(
      'unverified'
    );
  });
});
