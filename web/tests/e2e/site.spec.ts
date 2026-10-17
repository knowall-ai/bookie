import { expect, test } from '@playwright/test';

test.describe('public site', () => {
  test('landing page: hero, nav, sign in and get started', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('bookkeeper');
    const header = page.locator('header').first();
    await expect(header.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/portal');
    await expect(page.getByRole('link', { name: 'Get started' }).first()).toHaveAttribute(
      'href',
      '/install'
    );
    const shots = page.locator('#screenshots');
    await expect(shots).toContainText(/Microsoft.s CRONUS sample company/);
    await shots.getByRole('tab', { name: 'Ask Bookie' }).click();
    await expect(shots.getByRole('img', { name: /Ask Bookie panel/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /knowall-ai\/bookie on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/knowall-ai/bookie'
    );
  });

  test('example figures are labelled as fictional illustrations', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByText('Illustration: fictional Contoso Coffee Roasters Ltd')
    ).toBeVisible();
    await expect(page.getByText(/Illustration with fictional organisations/)).toBeVisible();
  });

  test('connector switch changes the source, not the layout', async ({ page }) => {
    await page.goto('/#connectors');
    const bc = page.getByRole('radio', { name: 'Business Central' });
    await bc.click();
    await expect(bc).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Read live from the Business Central API')).toBeVisible();
  });

  test('FAQ answers expand', async ({ page }) => {
    await page.goto('/#faq');
    await page.getByText('Is my Xero data used to train AI?').click();
    await expect(page.getByText(/not used to train or fine-tune any model/)).toBeVisible();
  });

  test('install links to Microsoft admin consent with our callback', async ({ page }) => {
    await page.goto('/install');
    const link = page.getByRole('link', { name: 'Install for my organisation' });
    const href = new URL((await link.getAttribute('href'))!);
    expect(href.hostname).toBe('login.microsoftonline.com');
    expect(href.pathname).toBe('/organizations/adminconsent');
    expect(href.searchParams.get('redirect_uri')).toMatch(/\/install\/complete$/);
  });

  test('install complete: success and error states', async ({ page }) => {
    await page.goto(
      '/install/complete?admin_consent=True&tenant=00000000-0000-0000-0000-000000000000'
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Bookie is installed. Thank you.'
    );
    await page.goto('/install/complete?error=access_denied');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Installation was cancelled');
  });

  for (const path of ['/privacy', '/terms', '/security']) {
    test(`${path} renders`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }

  test('meet Bookie: the intro video waits for a click, then plays with sound and captions', async ({
    page,
  }) => {
    const videoRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().endsWith('.mp4')) videoRequests.push(r.url());
    });
    await page.goto('/');
    const section = page.locator('section[aria-labelledby="bookie"]');
    const video = section.locator('video');
    await expect(video).toHaveAttribute('preload', 'none');
    await expect(video).toHaveAttribute('poster', '/bookie/bookie-intro-poster.jpg');
    await expect(video).not.toHaveAttribute('autoplay', /.*/);
    await expect(video.locator('track[kind="captions"]')).toHaveAttribute(
      'src',
      '/bookie/bookie-intro.vtt'
    );
    // The hero uses a still, so nothing has fetched a video yet.
    expect(videoRequests).toEqual([]);

    const toggle = section.getByRole('button', { name: 'Show transcript' });
    await toggle.click();
    await expect(section.getByRole('button', { name: 'Hide transcript' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expect(section.getByText('Shall we have a look?')).toBeVisible();

    await section.getByRole('button', { name: /Play Bookie’s 30-second introduction/ }).click();
    await expect(video).toHaveJSProperty('muted', false);
    await expect(video).toHaveJSProperty('controls', true);
  });

  test('your data stays yours: full-bleed Bookie by the vault, with the four promises @mobile', async ({
    page,
  }) => {
    await page.goto('/#security');
    const section = page.locator('section[aria-labelledby="security"]');
    await expect(section.getByRole('heading', { name: 'Your data stays yours' })).toBeVisible();
    await expect(section.getByRole('img', { name: /closed brass vault door/ })).toBeVisible();
    await expect(section.locator('dt')).toHaveText([
      'Bookie never stores your accounts',
      'Settings sealed, and kept in your own Microsoft 365',
      'Each organisation is walled off',
      'Xero data is never used to train AI',
    ]);
    await expect(
      section.getByRole('link', { name: 'Read how Bookie handles data' })
    ).toHaveAttribute('href', '/security');
    // Edge to edge: the band is as wide as the viewport.
    const box = await section.boundingBox();
    const width = page.viewportSize()!.width;
    expect(box!.x).toBe(0);
    expect(Math.round(box!.width)).toBe(width);
  });

  test('mobile: no horizontal scroll, menu opens', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.locator('#site-menu').getByRole('link', { name: 'FAQ' })).toBeVisible();
  });
});

test('footer links to the source on GitHub with the GitHub logo', async ({ page }) => {
  for (const path of ['/', '/security']) {
    await page.goto(path);
    const link = page.getByTestId('footer-github');
    await expect(link).toHaveAttribute('href', 'https://github.com/knowall-ai/bookie');
    await expect(link.locator('svg')).toBeVisible();
  }
});
