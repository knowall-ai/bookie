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
      await expect(page.getByTestId('public-bookie-launcher')).toHaveText(/Ask Bookie/);
    });
  }

  test('widget is not in the portal', async ({ page }) => {
    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: 'My organisations' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('public-bookie-launcher')).toHaveCount(0);
  });

  test('offers text or voice, and closes the choice with Escape', async ({ page }) => {
    await page.goto('/');
    const launcher = page.getByTestId('public-bookie-launcher');
    await launcher.click();
    const choice = page.getByRole('dialog', { name: 'Hello, I’m Bookie' });
    await expect(choice).toBeVisible();
    const chat = choice.getByRole('button', { name: 'Chat with Bookie' });
    await expect(chat).toBeFocused();
    // AI is off in e2e, so voice is offered but unavailable, and says so.
    await expect(choice.getByRole('button', { name: 'Talk to Bookie' })).toBeDisabled();
    await expect(choice).toContainText('Voice isn’t available just now');
    await expect(launcher).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(choice).toBeHidden();
    await expect(launcher).toBeFocused();
    // Nothing is loaded until the visitor chooses.
    await expect(page.getByTestId('public-bookie-panel')).toHaveCount(0);
  });

  test('choosing voice opens the panel and places the call', async ({ page }) => {
    // Pretend voice is on; the call then stops at the microphone, which we refuse,
    // so no pass is fetched and no model is called.
    await page.route('/api/public/status', (route) =>
      route.fulfill({ json: { enabled: true, voice: true } })
    );
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: () => {
            (window as unknown as { micAsked: boolean }).micAsked = true;
            return Promise.reject(new DOMException('Refused in test', 'NotAllowedError'));
          },
        },
      });
    });
    await page.goto('/');
    await page.getByTestId('public-bookie-launcher').click();
    await page.getByRole('button', { name: 'Talk to Bookie' }).click();
    const panel = page.getByRole('dialog', { name: 'Bookie' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('alert')).toContainText('needs your microphone', {
      timeout: 30_000,
    });
    expect(await page.evaluate(() => (window as unknown as { micAsked?: boolean }).micAsked)).toBe(
      true
    );
    await expect(panel.getByRole('textbox')).not.toBeFocused();
  });

  test('opens with the notice, chats, and closes with Escape', async ({ page }) => {
    await page.goto('/');
    const launcher = page.getByTestId('public-bookie-launcher');
    await launcher.click();
    await page.getByRole('button', { name: 'Chat with Bookie' }).click();
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
    const choice = await page.getByTestId('public-bookie-choice').boundingBox();
    expect(choice!.x).toBeGreaterThanOrEqual(0);
    expect(choice!.x + choice!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.getByRole('button', { name: 'Chat with Bookie' }).click();
    const box = await page.getByRole('dialog', { name: 'Bookie' }).boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  });
});
