import { expect, test } from '@playwright/test';

const ORG = '/portal/demo.contoso';

test.describe('account menu', () => {
  test('shows initials for the demo user and never asks Graph for a photo', async ({ page }) => {
    const photoRequests: string[] = [];
    page.on('request', (r) => r.url().includes('/api/me/photo') && photoRequests.push(r.url()));
    await page.goto(ORG);
    const button = page.getByTestId('user-menu-button');
    await expect(button).toContainText('AM');
    await expect(page.getByTestId('user-photo')).toHaveCount(0);
    expect(photoRequests).toEqual([]);
  });

  test('opens with name, email, Settings and Sign out, and closes on Escape', async ({ page }) => {
    await page.goto(ORG);
    const button = page.getByRole('button', { name: 'Account menu' });
    const chevron = page.getByTestId('user-menu-chevron');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(chevron).toBeVisible();
    await expect(chevron).not.toHaveClass(/rotate-180/);
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(chevron).toHaveClass(/rotate-180/);

    const menu = page.getByRole('menu', { name: 'Account' });
    await expect(menu.getByText('Alex Morgan')).toBeVisible();
    await expect(menu.getByText('alex.morgan@contoso.example')).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/portal/settings'
    );
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();

    // Keyboard: focus starts on the first item and the arrows move it.
    await expect(menu.getByRole('menuitem', { name: 'Settings' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
  });

  test('closes on an outside click and opens from the keyboard', async ({ page }) => {
    await page.goto(ORG);
    const button = page.getByRole('button', { name: 'Account menu' });
    await button.click();
    await expect(page.getByRole('menu', { name: 'Account' })).toBeVisible();
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('menu', { name: 'Account' })).toBeHidden();

    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeFocused();
  });

  test('shows the chevron and opens the menu on a phone @mobile', async ({ page }) => {
    await page.goto(ORG);
    await expect(page.getByTestId('user-menu-chevron')).toBeVisible();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  });

  test('Settings opens the settings page', async ({ page }) => {
    await page.goto(ORG);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/portal\/settings$/);
  });
});
