/** Resources Bookie calls on the user's behalf, and the scope used to get a token for each. */
export const RESOURCES = {
  bc: 'https://api.businesscentral.dynamics.com',
  graph: 'https://graph.microsoft.com',
} as const;

export type ResourceName = keyof typeof RESOURCES;

/** Sign-in scopes. Other resources are reached by redeeming the refresh token (see tokens.ts). */
export const SIGN_IN_SCOPES = 'openid profile email offline_access User.Read';

export function scopeFor(resource: ResourceName): string {
  return `${RESOURCES[resource]}/.default offline_access`;
}

/** Entra authority for sign-in: `organizations` when multi-tenant, else the home tenant. */
export function signInAuthority(): string {
  if (process.env.AZURE_AD_MULTI_TENANT === 'true') return 'organizations';
  return process.env.AZURE_AD_TENANT_ID || 'organizations';
}
