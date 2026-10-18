/**
 * "Is this email genuine?": the sender-authentication checks from the Bookie agent's
 * bill-capture skill (step 0), ported from `agent/hermes/scripts/mail-trust.mjs` so the
 * portal's Accounts inbox applies exactly the same rules (change both together). Pure
 * functions, no I/O.
 *
 * Only Exchange Online's own verdict counts (authserv-id `mx.microsoft.com`): anyone can
 * add an Authentication-Results header to their own message claiming anything.
 */

export interface MailAddress {
  emailAddress?: { address?: string; name?: string };
}

/** The Graph message fields the checks read. */
export interface MailHeaders {
  from?: MailAddress;
  sender?: MailAddress;
  replyTo?: MailAddress[];
  internetMessageHeaders?: { name: string; value: string }[];
}

export interface MailTrustFacts {
  from: string | null;
  fromDomain: string | null;
  senderDomain: string | null;
  replyToDomains: string[];
  returnPathDomain: string | null;
  spf: string;
  dkim: string;
  dkimDomain: string;
  dmarc: string;
  compositeAuth: string;
  /** Exchange Online recorded an Authentication-Results header for this message. */
  exchangeVerdictPresent: boolean;
  /** Microsoft's spam confidence level (SCL); `undefined` when the header is missing. */
  spamConfidence?: number;
  /** Microsoft's filter category (PHSH phishing, SPOOF, SPM, BULK...). */
  spamCategory: string | null;
  flaggedByMicrosoft: boolean;
  replyToDiffers: boolean;
  authenticated: boolean;
}

/** Categories that mean Microsoft thinks the mail is phishing, spoofing, impersonation or malware. */
const BAD_CATEGORIES = ['PHSH', 'HPHSH', 'SPOOF', 'GIMP', 'UIMP', 'DIMP', 'MALW'];

export function domainOf(address: string | undefined | null): string | null {
  const domain = (address ?? '').trim().split('@')[1]?.toLowerCase();
  return domain ? domain.replace(/[>\s]+$/, '') : null;
}

export function mailTrustFacts(m: MailHeaders): MailTrustFacts {
  const headers = m.internetMessageHeaders ?? [];
  const all = (name: string) =>
    headers.filter((h) => h.name.toLowerCase() === name.toLowerCase()).map((h) => h.value);
  const authResults = all('Authentication-Results').filter((v) =>
    /^\s*mx\.microsoft\.com\b/i.test(v)
  );
  const auth = authResults.join('; ');
  const pick = (re: RegExp) => auth.match(re)?.[1]?.toLowerCase() ?? 'none';

  const from = m.from?.emailAddress?.address ?? null;
  const fromDomain = domainOf(from);
  const replyToDomains = [
    ...new Set(
      (m.replyTo ?? [])
        .map((r) => domainOf(r.emailAddress?.address))
        .filter((d): d is string => !!d)
    ),
  ];
  const antispam = all('X-Forefront-Antispam-Report')[0] ?? '';
  const scl = antispam.match(/SCL:(-?\d+)/)?.[1];
  const spamConfidence = scl === undefined ? undefined : Number(scl);
  const spamCategory = antispam.match(/CAT:([A-Z]+)/)?.[1] ?? null;
  const spf = pick(/spf=(\w+)/i);
  const dkim = pick(/dkim=(\w+)/i);
  const dmarc = pick(/dmarc=(\w+)/i);
  const compositeAuth = pick(/compauth=(\w+)/i);

  return {
    from,
    fromDomain,
    senderDomain: domainOf(m.sender?.emailAddress?.address),
    replyToDomains,
    returnPathDomain: domainOf(all('Return-Path')[0]?.replace(/[<>]/g, '')),
    spf,
    dkim,
    dkimDomain: pick(/header\.d=([\w.-]+)/i),
    dmarc,
    compositeAuth,
    exchangeVerdictPresent: authResults.length > 0,
    spamConfidence,
    spamCategory,
    flaggedByMicrosoft:
      (spamConfidence !== undefined && spamConfidence >= 5) ||
      BAD_CATEGORIES.includes(spamCategory ?? ''),
    replyToDiffers: replyToDomains.some((d) => d !== fromDomain),
    authenticated:
      dmarc === 'pass' || (compositeAuth === 'pass' && (dkim === 'pass' || spf === 'pass')),
  };
}

/* ------------------------------------------------------------------ */
/* Lookalike domains                                                   */
/* ------------------------------------------------------------------ */

/** Two-label public suffixes common in our markets; enough to find the registrable name. */
const TWO_LABEL_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ltd.uk',
  'plc.uk',
  'me.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'co.nz',
  'co.za',
  'com.mx',
  'com.sv',
  'co.in',
  'com.br',
]);

/** `billing.contoso.co.uk` → `{ name: 'contoso', suffix: 'co.uk' }`. */
export function registrableParts(domain: string): { name: string; suffix: string } {
  const labels = domain.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length < 2) return { name: labels[0] ?? '', suffix: '' };
  const lastTwo = labels.slice(-2).join('.');
  if (labels.length >= 3 && TWO_LABEL_SUFFIXES.has(lastTwo))
    return { name: labels[labels.length - 3], suffix: lastTwo };
  return { name: labels[labels.length - 2], suffix: labels[labels.length - 1] };
}

/** The registrable domain (`billing.contoso.co.uk` → `contoso.co.uk`). */
export function registrableDomain(domain: string): string {
  const { name, suffix } = registrableParts(domain);
  return suffix ? `${name}.${suffix}` : name;
}

/** Characters fraudsters swap in to look like others. */
function unconfuse(name: string): string {
  return name
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/0/g, 'o')
    .replace(/[1|]/g, 'l')
    .replace(/i/g, 'l')
    .replace(/5/g, 's')
    .replace(/3/g, 'e')
    .replace(/[-_]/g, '');
}

/** Damerau-Levenshtein (optimal string alignment) distance. */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** Extra words fraudsters add to a real name (`contoso-billing`, `invoices-contoso`). */
const BAIT_WORDS = /(billing|invoices?|payments?|accounts?|finance|secure|support|pay|portal)/g;

/**
 * Which known domain `domain` imitates, if any. The same registrable domain (a subdomain
 * such as `billing.contoso.com`) is not a lookalike; it is the real thing.
 */
export function lookalikeOf(domain: string, known: readonly string[]): string | undefined {
  const mine = registrableParts(domain);
  const mineReg = registrableDomain(domain);
  if (!mine.name) return undefined;
  for (const candidate of known) {
    const real = registrableParts(candidate);
    if (!real.name || registrableDomain(candidate) === mineReg) continue;
    // Same name, different suffix (contoso.co → contoso.com).
    if (mine.name === real.name) return registrableDomain(candidate);
    const a = unconfuse(mine.name);
    const b = unconfuse(real.name);
    if (a === b) return registrableDomain(candidate);
    // Real name plus bait words (contoso-billing, contosoinvoices).
    const stripped = unconfuse(mine.name.replace(BAIT_WORDS, ''));
    if (b.length >= 4 && stripped === b) return registrableDomain(candidate);
    // One or two letters swapped, added or dropped.
    const limit = b.length >= 8 ? 2 : b.length >= 5 ? 1 : 0;
    if (limit && editDistance(a, b) <= limit) return registrableDomain(candidate);
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* The verdict                                                         */
/* ------------------------------------------------------------------ */

export type TrustLevel = 'trusted' | 'unverified' | 'suspicious';

export interface TrustVerdict {
  level: TrustLevel;
  /** Plain-English evidence, strongest first ("DMARC fail", "from c0ntoso.com, like contoso.com"). */
  reasons: string[];
  facts: MailTrustFacts;
}

export interface TrustContext {
  /** Domains of the organisation's contacts (their email and website domains). */
  supplierDomains: readonly string[];
  /** The organisation's own domains (the accounts mailbox's domain, the user's). */
  ownDomains: readonly string[];
}

/**
 * Suspicious (any one is enough): DMARC or compauth `fail`; Microsoft flagged it (SCL 5+,
 * or a phishing/spoof/impersonation category); a lookalike of a supplier's or our own
 * domain; reply-to on a different domain. Unverified: no passing authentication, or a
 * sender domain that isn't a known supplier's. Trusted: authenticated, from a known
 * supplier domain, nothing else wrong.
 */
export function trustVerdict(facts: MailTrustFacts, context: TrustContext): TrustVerdict {
  const suspicious: string[] = [];
  const unverified: string[] = [];
  const domain = facts.fromDomain;

  if (facts.dmarc === 'fail') suspicious.push('DMARC fail');
  if (facts.compositeAuth === 'fail') suspicious.push('Microsoft composite authentication fail');
  if (facts.flaggedByMicrosoft)
    suspicious.push(
      `Microsoft flagged it${facts.spamCategory ? ` (${facts.spamCategory})` : ''}${
        facts.spamConfidence !== undefined ? `, spam score ${facts.spamConfidence}` : ''
      }`
    );
  if (domain) {
    const known = [...context.supplierDomains, ...context.ownDomains].filter(Boolean);
    const imitated = lookalikeOf(domain, known);
    if (imitated) suspicious.push(`from ${domain}, which looks like ${imitated}`);
  } else {
    suspicious.push('no sender address');
  }
  // A reply-to on the sender's own registrable domain (billing.contoso.com) is fine.
  const foreignReplyTo = facts.replyToDomains.filter(
    (d) => !domain || registrableDomain(d) !== registrableDomain(domain)
  );
  if (foreignReplyTo.length)
    suspicious.push(`replies go to ${foreignReplyTo.join(', ')}, not ${domain ?? 'the sender'}`);

  if (!facts.exchangeVerdictPresent)
    unverified.push('no authentication result from Exchange Online');
  else if (!facts.authenticated) unverified.push('sender authentication did not pass');
  const supplierRegs = new Set(context.supplierDomains.map(registrableDomain));
  if (domain && !supplierRegs.has(registrableDomain(domain)))
    unverified.push(`${domain} isn't a domain Bookie knows from your contacts`);

  const level: TrustLevel = suspicious.length
    ? 'suspicious'
    : unverified.length
      ? 'unverified'
      : 'trusted';
  return { level, reasons: suspicious.length ? suspicious : unverified, facts };
}
