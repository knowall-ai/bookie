import type { NextConfig } from 'next';
import { baselineHeaders } from './src/lib/security/headers';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Lets the Playwright server run beside a developer's own `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  poweredByHeader: false,
  // We maintain our own AGENTS.md at the repo root.
  agentRules: false,
  experimental: {
    // Attachment uploads (PDF/PNG/JPG up to 10 MB) go through a server action.
    serverActions: { bodySizeLimit: '11mb' },
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  // Baseline headers on every response, public/ files included. The
  // Content-Security-Policy is per request (it carries a nonce): src/proxy.ts.
  async headers() {
    return [{ source: '/:path*', headers: baselineHeaders }];
  },
};

export default nextConfig;
