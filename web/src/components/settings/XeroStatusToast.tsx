'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

const MESSAGES: Record<string, [kind: 'success' | 'error' | 'info', text: string]> = {
  connected: ['success', 'Xero connected. Your organisations are in the switcher.'],
  cancelled: ['info', 'Xero connection cancelled.'],
  invalid: ['error', 'That Xero sign-in could not be verified. Please try again.'],
  failed: ['error', 'Xero did not complete the connection. Please try again.'],
  'not-configured': [
    'info',
    '“Connect to Xero” is not configured on this server. Use Custom Connection keys instead.',
  ],
};

/** Shows the outcome of the Xero OAuth round trip once, then tidies the URL. */
export function XeroStatusToast({ status }: { status?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!status || !MESSAGES[status]) return;
    const [kind, text] = MESSAGES[status];
    toast[kind](text);
    router.replace(pathname);
  }, [status, router, pathname]);
  return null;
}
