import { publicAiDisabled, publicAzureConfig, publicBookieEnabled } from '@/lib/public-bookie/config';

export const dynamic = 'force-dynamic';

/**
 * Whether the public helper is on (the kill switch) and whether voice is
 * available. Read by the widget at runtime, because the site pages are static.
 * Reveals nothing but two booleans.
 */
export function GET() {
  const enabled = publicBookieEnabled();
  const configured = !!publicAzureConfig();
  return Response.json(
    {
      // With AI disabled (tests) chat still answers from a canned reply.
      enabled: enabled && (configured || publicAiDisabled()),
      voice: enabled && configured && !publicAiDisabled(),
    },
    { headers: { 'Cache-Control': 'public, max-age=60' } }
  );
}
