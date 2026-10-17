import { expect, test } from '@playwright/test';

/**
 * Bookie's public helper on the marketing site. The e2e server runs with
 * BOOKIE_DISABLE_AI=1, so the chat answers with its offline reply and no
 * model is called; voice is hidden.
 */
test.describe('public Bookie helper', () => {
  for (const path of ['/', '/security']) {
    test(`widget is on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId('public-bookie-launcher')).toBeVisible();
      await expect(page.getByTestId('public-bookie-launcher')).toHaveText(/Talk to Bookie/);
    });
  }

  test('widget is not in the portal', async ({ page }) => {
    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: 'My organisations' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('public-bookie-launcher')).toHaveCount(0);
  });

  test('opens with the notice, chats, and closes with Escape', async ({ page }) => {
    await page.goto('/');
    const launcher = page.getByTestId('public-bookie-launcher');
    await launcher.click();
    const panel = page.getByRole('dialog', { name: 'Bookie' });
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('public-bookie-notice')).toHaveText(
      "This is Bookie's public helper. It can't see anyone's accounts. Don't share personal or financial details."
    );
    // AI is off in e2e: no voice button.
    await expect(panel.getByTestId('public-bookie-call')).toHaveCount(0);

    const input = panel.getByRole('textbox', { name: 'Ask Bookie about the product' });
    await expect(input).toBeFocused();
    await input.fill('What is Bookie?');
    await input.press('Enter');
    await expect(panel.getByTestId('public-bookie-reply')).toContainText("I'm offline just now", {
      timeout: 30_000,
    });
    await expect(panel.getByRole('link', { name: 'security' })).toHaveAttribute(
      'href',
      '/security'
    );

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(launcher).toBeFocused();
  });

  test('the API refuses other sites and callers without a pass', async ({ request, baseURL }) => {
    const foreign = await request.post('/api/public/chat', {
      headers: { origin: 'https://evil.example' },
      data: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(foreign.status()).toBe(403);
    const noPass = await request.post('/api/public/chat', {
      headers: { origin: new URL(baseURL!).origin },
      data: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(noPass.status()).toBe(401);
  });

  test('@mobile panel fits the screen', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('public-bookie-launcher').click();
    const box = await page.getByRole('dialog', { name: 'Bookie' }).boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  });
});
