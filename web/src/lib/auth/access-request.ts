/** Where people from an organisation that isn't approved ask for access. */
export const ACCESS_REQUEST_EMAIL = 'hello@knowall.ai';

export interface AccessRequest {
  /** The organisation's display name, when Microsoft could tell us. */
  organisation?: string;
  /** The Entra tenant id from the sign-in, when it had one. */
  tenantId?: string;
  email?: string;
}

/**
 * A `mailto:` link that opens the person's own mail app with a pre-filled
 * request: Bookie sends nothing itself and holds no mail credentials.
 */
export function accessRequestMailto({ organisation, tenantId, email }: AccessRequest): string {
  const body = [
    'Hello KnowAll,',
    '',
    'Please could you set up our organisation on Bookie?',
    '',
    'App: Bookie',
    `Organisation: ${organisation || 'Not known'}`,
    `Tenant ID: ${tenantId || 'Not known'}`,
    `Email: ${email || 'Not known'}`,
    '',
    'Thank you',
  ].join('\n');
  const subject = 'Bookie access request';
  return `mailto:${ACCESS_REQUEST_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
