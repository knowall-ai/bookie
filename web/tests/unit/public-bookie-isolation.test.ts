import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static proof that Bookie's public helper cannot reach accounting data:
 * walk the import graph from every public-helper file and check that it only
 * ever touches its own modules (plus two pure UI helpers) and a short list of
 * packages. The ESLint rule catches direct imports; this catches indirect ones.
 */
const SRC = path.resolve(__dirname, '../../src');
const ROOTS = ['app/api/public', 'lib/public-bookie', 'components/public-bookie'];

const ALLOWED_LOCAL = [
  'app/api/public/',
  'lib/public-bookie/',
  'components/public-bookie/',
  'components/bookie/BookieAvatar.tsx',
  'lib/ui/cn.ts',
];
const ALLOWED_PACKAGES = [
  'zod',
  'server-only',
  'react',
  'react-dom',
  'next/dynamic',
  'lucide-react',
  '@azure/identity',
  'node:crypto',
  'clsx',
  'tailwind-merge',
];
const FORBIDDEN = [
  'lib/connectors',
  'lib/config/',
  'lib/auth',
  'lib/bookie',
  'lib/portal',
  'lib/webhooks',
  'lib/connections',
  'lib/attachments',
  'components/bookie/BookiePanel',
  'components/bookie/useBookieVoice',
];

function filesUnder(dir: string): string[] {
  const abs = path.join(SRC, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { recursive: true })
    .map((f) => path.join(abs, String(f)))
    .filter((f) => statSync(f).isFile() && /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
}

function importsOf(source: string): string[] {
  const specs = new Set<string>();
  const patterns = [
    /\bimport\s+(?:type\s+)?[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*?\sfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) for (const m of source.matchAll(re)) specs.add(m[1]);
  return [...specs];
}

function resolveLocal(spec: string, from: string): string | undefined {
  const base = spec.startsWith('@/')
    ? path.join(SRC, spec.slice(2))
    : spec.startsWith('.')
      ? path.resolve(path.dirname(from), spec)
      : undefined;
  if (!base) return undefined;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return `${base}.ts`; // Unresolvable: report it as-is so the check fails loudly.
}

function walk(entries: string[]) {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(file)) continue;
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      const local = resolveLocal(spec, file);
      if (local) queue.push(local);
      else packages.add(spec);
    }
  }
  return { files: [...seen].map((f) => path.relative(SRC, f)), packages: [...packages] };
}

const entries = ROOTS.flatMap(filesUnder);
const graph = walk(entries);

describe('public Bookie import isolation', () => {
  it('finds the public helper files', () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
    expect(graph.files).toContain('lib/public-bookie/prompt.ts');
    expect(graph.files).toContain('app/api/public/chat/route.ts');
  });

  it('reaches only its own modules', () => {
    const outside = graph.files.filter((f) => !ALLOWED_LOCAL.some((a) => f.startsWith(a)));
    expect(outside).toEqual([]);
  });

  it('never reaches connectors, settings, sign-in or the portal Bookie', () => {
    const bad = graph.files.filter((f) => FORBIDDEN.some((x) => f.includes(x)));
    expect(bad).toEqual([]);
  });

  it('uses only allow-listed packages', () => {
    const extra = graph.packages.filter(
      (p) => !ALLOWED_PACKAGES.includes(p) && !p.startsWith('next/server')
    );
    expect(extra).toEqual([]);
  });

  it('the scanner itself catches indirect and dynamic imports', () => {
    expect(
      importsOf(
        "import { x } from '@/lib/bookie/tools';\nexport * from '../connectors/xero';\nconst m = await import('@/lib/auth/context');"
      )
    ).toEqual(['@/lib/bookie/tools', '../connectors/xero', '@/lib/auth/context']);
  });

  it('server code reads only the public environment variables', () => {
    const allowed = new Set([
      'NODE_ENV',
      'BOOKIE_DISABLE_AI',
      'NEXTAUTH_URL',
      'BOOKIE_SITE_URL',
      'TURNSTILE_SECRET',
    ]);
    // Development-only fallback to the portal's local settings, in config.ts alone.
    const devFallback = new Set([
      'AZURE_OPENAI_ENDPOINT',
      'AZURE_OPENAI_API_KEY',
      'BOOKIE_CHAT_DEPLOYMENT',
      'BOOKIE_VOICE_DEPLOYMENT',
    ]);
    const problems: string[] = [];
    for (const file of entries) {
      const rel = path.relative(SRC, file);
      for (const m of readFileSync(file, 'utf8').matchAll(
        /process\.env\.([A-Z0-9_]+)|process\.env\[['"]?([A-Z0-9_]*)/g
      )) {
        const name = m[1] ?? m[2];
        if (!name) continue; // process.env[name] in a helper: its callers are checked.
        if (name.startsWith('PUBLIC_') || allowed.has(name)) continue;
        if (devFallback.has(name) && rel === 'lib/public-bookie/config.ts') continue;
        problems.push(`${rel}: ${name}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('the portal fallback is development-only', () => {
    const config = readFileSync(path.join(SRC, 'lib/public-bookie/config.ts'), 'utf8');
    expect(config).toMatch(
      /if \(!endpoint && !isProduction\(\)\) \{\s*\/\/[^\n]*\n\s*endpoint = process\.env\.AZURE_OPENAI_ENDPOINT/
    );
  });

  it('the ESLint rule covers the public helper folders', () => {
    const eslint = readFileSync(path.resolve(SRC, '../eslint.config.mjs'), 'utf8');
    for (const glob of ['src/app/api/public/**', 'src/lib/public-bookie/**']) {
      expect(eslint).toContain(`'${glob}'`);
    }
    for (const forbidden of [
      '@/lib/connectors/**',
      '@/lib/config/**',
      '@/lib/auth/**',
      '@/lib/bookie/**',
    ]) {
      expect(eslint).toContain(`'${forbidden}'`);
    }
  });
});
