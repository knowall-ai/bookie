import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Bookie's public helper must never be able to reach accounting data, sign-in,
  // settings, the portal Bookie's tools or prompt. See docs/PUBLIC_ASSISTANT.adoc;
  // tests/unit/public-bookie-isolation.test.ts checks the full import graph too.
  {
    files: ['src/app/api/public/**', 'src/lib/public-bookie/**', 'src/components/public-bookie/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/lib/connectors',
                '@/lib/connectors/**',
                '@/lib/config',
                '@/lib/config/**',
                '@/lib/auth',
                '@/lib/auth/**',
                '@/lib/bookie',
                '@/lib/bookie/**',
                '@/lib/portal',
                '@/lib/portal/**',
                '@/lib/webhooks/**',
                '@/lib/connections',
                '@/lib/attachments',
                '@/lib/domain/**',
                '@/components/bookie/BookiePanel',
                '@/components/bookie/useBookieVoice',
                '**/lib/connectors/**',
                '**/lib/config/**',
                '**/lib/auth/**',
                '**/lib/bookie/**',
                '**/lib/portal/**',
                'next-auth',
                'next-auth/**',
              ],
              message:
                "The public helper must not import accounting, auth, settings or the portal Bookie's tools and prompt.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    '.next-e2e/**',
    '.next-e2e-guest/**',
    '.next-e2e-unapproved/**',
    // Any other Next build folder (NEXT_DIST_DIR), e.g. a screenshot server's .next-shot.
    '.next-*/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
  ]),
]);

export default eslintConfig;
