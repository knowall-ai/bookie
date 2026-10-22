import { expect, test } from '@playwright/test';

const ORG = '/portal/demo.contoso';

test.describe('portal shell', () => {
  test('My organisations lists the demo organisations and opens one', async ({ page }) => {
    await page.goto('/portal');
    await expect(page.getByRole('heading', { name: 'My organisations' })).toBeVisible();
    const list = page.getByTestId('org-list');
    await expect(list.getByText('Contoso Coffee Roasters Ltd')).toBeVisible();
    await expect(list.getByText('Contoso Wholesale Ltd')).toBeVisible();
    await list.getByText('Contoso Coffee Roasters Ltd').click();
    await expect(page).toHaveURL(new RegExp(`${ORG}$`));
  });

  test('top tabs follow Xero order and open their menus', async ({ page }) => {
    await page.goto(`${ORG}/sales/invoices`);
    const nav = page.getByRole('navigation', { name: 'Main' });
    const labels = await nav.locator(':scope > a, :scope > div > button').allInnerTexts();
    expect(labels.map((l) => l.trim())).toEqual([
      'Home',
      'Sales',
      'Purchases',
      'Reporting',
      'Accounting',
      'Payroll',
      'Projects',
      'Contacts',
    ]);
    await page.getByTestId('tab-sales').click();
    await expect(page.getByRole('menuitem', { name: 'Quotes' })).toBeVisible();
  });

  test('a tab menu opened by hovering stays open when clicked, and on the way into it', async ({
    page,
  }) => {
    await page.goto('/portal/demo.contoso');
    const tab = page.getByTestId('tab-purchases');
    await tab.hover();
    await expect(tab).toHaveAttribute('aria-expanded', 'true');
    // The click that used to toggle it shut.
    await tab.click();
    await expect(tab).toHaveAttribute('aria-expanded', 'true');
    // Down into the menu: no gap closes it on the way.
    await page.getByRole('menuitem', { name: 'Bills', exact: true }).click();
    await expect(page).toHaveURL(/\/purchases\/bills/);
  });

  test('org switcher keeps the current tab', async ({ page }) => {
    await page.goto(`${ORG}/sales/invoices`);
    await page.getByTestId('org-switcher').click();
    await page.getByRole('option', { name: /Contoso Wholesale Ltd/ }).click();
    await expect(page).toHaveURL(/\/portal\/demo\.contoso-wholesale\/sales\/invoices/);
  });

  test('unknown organisations are not found', async ({ page }) => {
    const response = await page.goto('/portal/xero.not-mine.not-mine/sales/invoices');
    expect(response?.status()).toBe(404);
  });
});

test.describe('invoices', () => {
  test('status tabs filter the list', async ({ page }) => {
    await page.goto(`${ORG}/sales/invoices?status=draft`);
    await expect(page.getByRole('tab', { name: 'Draft', selected: true })).toBeVisible();
    const statuses = await page.locator('tbody tr td:last-child').allInnerTexts();
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) expect(status.trim()).toBe('Draft');
  });

  test('create a draft invoice, then approve it with confirmation', async ({ page }) => {
    await page.goto(`${ORG}/sales/invoices/new`);
    await page.getByTestId('editor-contact').selectOption({ label: 'Fabrikam Hotels' });
    await page.getByTestId('line-0-description').fill('Espresso blend 1kg, monthly order');
    await page.getByLabel('Quantity').first().fill('10');
    await page.getByTestId('line-0-price').fill('24');
    // No tax rate picked: the source applies its default, so no tax or total is guessed.
    await expect(page.getByTestId('editor-subtotal')).toContainText('240.00');
    await expect(page.getByTestId('editor-total')).toHaveCount(0);
    await expect(page.getByTestId('editor-tax-note')).toContainText('calculated by');
    // With a rate the source gave us, the tax is previewed and labelled as a preview.
    await page.getByLabel('Tax rate').first().selectOption({ index: 1 });
    await expect(page.getByTestId('editor-total')).toBeVisible();
    await expect(page.getByText('(preview)').first()).toBeVisible();
    await page.getByTestId('save-draft').click();
    await expect(page.getByRole('heading', { name: /Invoice INV-/ })).toBeVisible();
    await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('live books');
    await page.getByTestId('confirm-action').click();
    await expect(page.getByText('Awaiting payment').first()).toBeVisible();
  });

  test('bills use the same list under Purchases', async ({ page }) => {
    await page.goto(`${ORG}/purchases/bills`);
    await expect(page.getByRole('heading', { name: 'Bills' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });
});

test.describe('settings and Bookie', () => {
  test('settings shows both connectors with toggles', async ({ page }) => {
    await page.goto('/portal/settings');
    await expect(page.getByRole('heading', { name: 'Xero', exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Business Central', exact: true })
    ).toBeVisible();
    await expect(page.getByTestId('toggle-xeroEnabled')).toHaveAttribute('aria-checked', 'true');
  });

  test('Ask Bookie opens with suggestions for the open organisation', async ({ page }) => {
    await page.goto(ORG);
    await page.getByTestId('ask-bookie').click();
    const panel = page.getByTestId('bookie-panel');
    await expect(panel).toContainText('Contoso Coffee Roasters Ltd');
    await expect(panel.getByRole('button', { name: 'How is cash looking?' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Call on Teams' })).toHaveAttribute(
      'href',
      /teams\.microsoft\.com/
    );
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
});

test.describe('mobile @mobile', () => {
  test.use({ viewport: { width: 360, height: 760 } });
  for (const path of ['/portal', `${ORG}`, `${ORG}/sales/invoices`, `${ORG}/contacts`]) {
    test(`no sideways scroll on ${path}`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
