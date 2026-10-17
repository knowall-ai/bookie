#!/usr/bin/env node
/**
 * Captures the README, docs and website screenshots from a running Bookie.
 *
 *   ORG=bc.Sandbox.<companyId> BASE_URL=http://localhost:3103 node web/scripts/capture-screenshots.mjs
 *
 * ORG must be Microsoft's CRONUS sample company in a Business Central **Sandbox** environment
 * (the public repo holds no client data), and the server must be signed in as a user who can
 * reach it, e.g. `BOOKIE_DEV_AUTH=azure-cli bun run dev`. Ask Bookie needs Azure OpenAI settings.
 *
 * Optional env: OUT (default docs/images/screenshots at the repo root), ONLY (comma-separated
 * shot names to retake), QUALITY (WebP start quality, default 82).
 *
 * Each page is shot at 1440x900 with deviceScaleFactor 2, then downscaled to 1600px wide WebP
 * under ~350KB. Review every image before committing it.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3103').replace(/\/$/, '');
const ORG = process.env.ORG;
const OUT = path.resolve(process.env.OUT ?? path.join(here, '..', '..', 'docs/images/screenshots'));
const ONLY = process.env.ONLY?.split(',').map((s) => s.trim());
const START_QUALITY = Number(process.env.QUALITY ?? 82);
const MAX_BYTES = 350 * 1024;
const WIDTH = 1600;
const QUESTION = 'Who owes us the most, and how late are they?';
// CRONUS's postings are mostly in the previous calendar year, so the P&L shows that by default.
const lastYear = new Date().getFullYear() - 1;
const PNL_FROM = process.env.PNL_FROM ?? `${lastYear}-01-01`;
const PNL_TO = process.env.PNL_TO ?? `${lastYear}-12-31`;
// Prefer rows that show the feature well; each falls back to the list's first row.
const INVOICE_ROW = process.env.INVOICE_ROW ?? 'Paid';
const CONTACT_ROW = process.env.CONTACT_ROW ?? 'School of Fine Art';

if (!ORG || !/^bc\.Sandbox\./.test(ORG)) {
  console.error(
    'Set ORG to the CRONUS company key in a BC Sandbox (bc.Sandbox.<id>); see /portal.'
  );
  process.exit(1);
}

const portal = `${BASE_URL}/portal/${ORG}`;

/** Waits until the page has settled: network idle, no skeletons, no "Loading" text. */
async function settle(page, timeout = 90_000) {
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  await page
    .waitForFunction(
      () =>
        !document.querySelector('.animate-pulse, [aria-busy="true"]') &&
        !/^\s*Loading/m.test(document.body.innerText),
      undefined,
      { timeout }
    )
    .catch(() => console.warn('  (still loading after timeout, shooting anyway)'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

/** Removes the Next.js dev tools badge and anything else that shouldn't be in a picture. */
async function tidy(page) {
  await page.evaluate(() => {
    document.querySelectorAll('nextjs-portal, [data-nextjs-toast]').forEach((el) => el.remove());
    document.querySelectorAll('[data-sonner-toaster]').forEach((el) => el.remove());
  });
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await settle(page);
}

/**
 * Opens the first link in a list whose href matches `pattern`, preferring a row that contains
 * `rowText` (falls back to the first matching row).
 */
async function openFirst(page, listUrl, pattern, rowText) {
  await goto(page, listUrl);
  const href = await page.evaluate(
    ([source, text]) => {
      const re = new RegExp(source);
      const links = [...document.querySelectorAll('main a[href]')].filter((el) =>
        re.test(el.getAttribute('href') ?? '')
      );
      const row = (el) => el.closest('tr, li, [role="row"]')?.textContent ?? el.textContent ?? '';
      const a = (text && links.find((el) => row(el).includes(text))) || links[0];
      return a?.getAttribute('href') ?? null;
    },
    [pattern.source, rowText ?? '']
  );
  if (!href) throw new Error(`No link matching ${pattern} on ${listUrl}`);
  await goto(page, new URL(href, BASE_URL).toString());
}

async function save(page, name, { fullPage = false } = {}) {
  await tidy(page);
  const png = await page.screenshot({ fullPage, animations: 'disabled' });
  const image = sharp(png);
  const { width = WIDTH } = await image.metadata();
  let quality = START_QUALITY;
  let out;
  do {
    out = await sharp(png)
      .resize({ width: Math.min(WIDTH, width), withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toBuffer();
    quality -= 6;
  } while (out.length > MAX_BYTES && quality > 40);
  const file = path.join(OUT, `${name}.webp`);
  await writeFile(file, out);
  console.log(`  ${name}.webp ${(out.length / 1024).toFixed(0)}KB`);
}

const shots = [
  { name: 'home', run: (p) => goto(p, portal) },
  { name: 'sales-invoices', run: (p) => goto(p, `${portal}/sales/invoices`) },
  {
    name: 'invoice-detail',
    run: (p) =>
      openFirst(p, `${portal}/sales/invoices`, /\/sales\/invoices\/(?!new)[^/?#]+$/, INVOICE_ROW),
  },
  { name: 'quotes', run: (p) => goto(p, `${portal}/sales/quotes`) },
  { name: 'purchases-bills', run: (p) => goto(p, `${portal}/purchases/bills`) },
  { name: 'contacts', run: (p) => goto(p, `${portal}/contacts`) },
  {
    name: 'contact-detail',
    run: (p) => openFirst(p, `${portal}/contacts`, /\/contacts\/(?!new)[^/?#]+$/, CONTACT_ROW),
  },
  { name: 'reports', run: (p) => goto(p, `${portal}/reporting`) },
  {
    name: 'profit-and-loss',
    run: (p) => goto(p, `${portal}/reporting/profit-and-loss?from=${PNL_FROM}&to=${PNL_TO}`),
  },
  { name: 'balance-sheet', run: (p) => goto(p, `${portal}/reporting/balance-sheet`) },
  { name: 'aged-receivables', run: (p) => goto(p, `${portal}/reporting/aged-receivables`) },
  { name: 'chart-of-accounts', run: (p) => goto(p, `${portal}/accounting/chart`) },
  {
    name: 'settings',
    run: async (p) => {
      await goto(p, `${BASE_URL}/portal/settings`);
      // Show the connector switches only: the connection and company lists name every
      // organisation the signed-in user can reach, and the storage note shows tenant ids.
      await p.evaluate(() => {
        document
          .querySelectorAll('section[aria-labelledby$="Enabled-title"] > div:nth-child(2)')
          .forEach((el) => el.remove());
        document.querySelector('section[aria-labelledby="data-title"]')?.remove();
        document.querySelectorAll('[data-sonner-toaster]').forEach((el) => el.remove());
      });
    },
  },
  {
    name: 'ask-bookie',
    run: async (p) => {
      await goto(p, portal);
      await p.getByTestId('ask-bookie').click();
      const input = p.getByTestId('bookie-input');
      await input.fill(QUESTION);
      await input.press('Enter');
      // Wait for the reply to finish: the send button comes back once Bookie stops working.
      await p.waitForFunction(
        () => {
          const panel = document.querySelector('[data-testid="bookie-panel"]');
          if (!panel) return false;
          const working = panel.querySelector('.animate-pulse');
          const send = panel.querySelector('button[aria-label="Send"]');
          const text = panel.innerText;
          return !working && send && text.split('\n').filter(Boolean).length > 6;
        },
        undefined,
        { timeout: 240_000, polling: 1000 }
      );
      await p.waitForTimeout(1500);
    },
  },
  {
    name: 'home-mobile',
    viewport: { width: 390, height: 844 },
    run: (p) => goto(p, portal),
  },
  { name: 'landing', run: (p) => goto(p, `${BASE_URL}/`) },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = 0;
for (const shot of shots) {
  if (ONLY && !ONLY.includes(shot.name)) continue;
  console.log(shot.name);
  const context = await browser.newContext({
    viewport: shot.viewport ?? { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await shot.run(page);
    await save(page, shot.name);
  } catch (error) {
    failed++;
    console.error(`  FAILED: ${error instanceof Error ? error.message : error}`);
  } finally {
    await context.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
