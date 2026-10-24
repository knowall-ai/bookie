import { expect, test } from '@playwright/test';

/*
 * Approved organisations only. These specs run on a third server signed in as
 * a fictional Fabrikam user whose organisation KnowAll hasn't approved
 * (BOOKIE_DEV_AUTH=demo-unapproved), except the last, which uses the usual
 * approved demo server. See playwright.config.ts and docs/ACCESS.adoc.
 */
const UNAPPROVED_BASE_URL = process.env.UNAPPROVED_BASE_URL ?? 'http://localhost:3122';
const FABRIKAM_TENANT = '00000000-0000-0000-0000-00000000fab1';

test.describe('organisation not approved', () => {
  test.use({ baseURL: UNAPPROVED_BASE_URL });

  test('sees the not-set-up page instead of the portal @mobile', async ({ page }) => {
    await page.goto('/portal');
    await expect(page).toHaveURL(/\/not-approved$/);
    await expect(
      page.getByRole('heading', { name: 'Your organisation isn’t set up on Bookie yet.' })
    ).toBeVisible();

    const details = page.getByTestId('not-approved-details');
    await expect(details).toContainText('Fabrikam, Inc.');
    await expect(details).toContainText(FABRIKAM_TENANT);
    await expect(details).toContainText('casey.rivera@fabrikam.example');

    const request = page.getByTestId('request-access');
    await expect(request).toBeVisible();
    const href = new URL((await request.getAttribute('href')) ?? '');
    expect(href.protocol).toBe('mailto:');
    expect(href.pathname).toBe('hello@knowall.ai');
    expect(href.searchParams.get('subject')).toBe('Bookie access request');
    expect(href.searchParams.get('body')).toContain(`Tenant ID: ${FABRIKAM_TENANT}`);
    await expect(page.getByTestId('email-us')).toHaveAttribute('href', 'mailto:hello@knowall.ai');
    await expect(page.getByTestId('not-approved-sign-out')).toBeVisible();

    // No app data or navigation.
    await expect(page.getByTestId('org-list')).toHaveCount(0);
    await expect(page.getByTestId('org-switcher')).toHaveCount(0);
    await expect(page.getByText('Contoso Coffee Roasters')).toHaveCount(0);
  });

  test('gets no organisation pages, settings or data', async ({ page }) => {
    for (const path of [
      '/portal/demo.contoso',
      '/portal/demo.contoso/sales/invoices',
      '/portal/settings',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/not-approved$/);
      await expect(page.getByText('Contoso Coffee Roasters')).toHaveCount(0);
    }

    for (const path of [
      '/api/orgs/demo.contoso/events',
      '/api/orgs/demo.contoso/invoices/x/pdf',
      '/api/me/photo',
      '/api/email/pending',
    ]) {
      expect((await page.request.get(path)).status(), path).toBe(401);
    }
    const tool = await page.request.post('/api/bookie/tool', {
      data: { orgKey: 'demo.contoso', name: 'list_invoices', arguments: '{}' },
    });
    expect(tool.status()).toBe(401);
  });

  test('leaves the public site and its helper alone', async ({ page }) => {
    const status = await page.request.get('/api/public/status');
    expect(status.status()).toBe(200);
    await page.goto('/');
    await expect(page.getByTestId('public-bookie-launcher')).toBeVisible();
  });
});

test('an approved organisation goes straight to the portal', async ({ page }) => {
  await page.goto('/not-approved');
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole('heading', { name: 'My organisations' })).toBeVisible();
});
