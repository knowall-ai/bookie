import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    // `bun run test:coverage`. CI prints coverage/coverage-summary.json in the job summary.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      // A little below the measured numbers (Oct 2026: statements 37.9, branches 32.4,
      // functions 37.9, lines 37.8) so a drop fails CI. Raise them as coverage grows.
      thresholds: { statements: 36, branches: 30, functions: 36, lines: 36 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` throws outside React Server Components; tests run server code directly.
      'server-only': path.resolve(__dirname, 'tests/unit/server-only-stub.ts'),
    },
  },
});
