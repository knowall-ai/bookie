import { expect, test } from '@playwright/test';

/*
 * People and access. The member specs run on the usual demo server
 * (BOOKIE_DEV_AUTH=demo). The guest specs run on a second server signed in as
 * the demo guest accountant (BOOKIE_DEV_AUTH=demo-guest), whose seeded access
 * entry grants Contoso Coffee Roasters only. See playwright.config.ts.
 */
const GUEST_BASE_URL = process.env.GUEST_BASE_URL ?? 'http://localhost:3121';

test.describe('guest accountant', () => {
  test.use({ baseURL: GUEST_BASE_URL });

  test('guests have no Email navigation tab', async ({ page }) => {
    await page.goto('/portal/demo.contoso');
    await expect(page.getByRole('link', { name: /^Email/ })).toHaveCount(0);
    const response = await page.request.get('/api/email/pending');
    expect(await response.json()).toEqual({ count: 0 });
  });

  test('sees only the organisation they were given', async ({ page }) => {
    await page.goto('/portal');
    const list = page.getByTestId('org-list');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list.getByText('Contoso Coffee Roasters Ltd')).toBeVisible();
    await expect(page.getByText('Contoso Wholesale Ltd')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Add a connection/ })).toHaveCount(0);

    await page.getByTestId('org-switcher').click();
    await expect(page.getByRole('option')).toHaveCount(1);
  });

  test('gets a 404 for an organisation they were not given', async ({ page }) => {
    const denied = await page.goto('/portal/demo.contoso-wholesale');
    expect(denied?.status()).toBe(404);
    const deniedTab = await page.goto('/portal/demo.contoso-wholesale/sales/invoices');
    expect(deniedTab?.status()).toBe(404);
    const allowed = await page.goto('/portal/demo.contoso');
    expect(allowed?.status()).toBe(200);

    const events = await page.request.get('/api/orgs/demo.contoso-wholesale/events');
    expect(events.status()).toBe(404);
    const tool = await page.request.post('/api/bookie/tool', {
      data: { orgKey: 'demo.contoso-wholesale', name: 'list_invoices', arguments: '{}' },
    });
    expect(tool.status()).toBe(404);
    const pdf = await page.request.get('/api/orgs/demo.contoso-wholesale/invoices/x/pdf');
    expect(pdf.status()).toBe(404);
  });

  test('cannot open settings', async ({ page }) => {
    await page.goto('/portal/settings');
    const blocked = page.getByTestId('settings-guest');
    await expect(
      blocked.getByRole('heading', {
        name: 'Ask an administrator at Contoso to change connections',
      })
    ).toBeVisible();
    await expect(page.getByTestId('toggle-xeroEnabled')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'People and access' })).toHaveCount(0);
  });
});

test.describe('People and access (member)', () => {
  test('lists the guest and their access', async ({ page }) => {
    await page.goto('/portal/settings');
    const card = page.locator('section', {
      has: page.getByRole('heading', { name: 'People and access' }),
    });
    await expect(card).toBeVisible();
    await expect(card.getByText('Guests see nothing until they’re listed here.')).toBeVisible();
    await expect(card.getByTestId('toggle-membersSeeAll')).toHaveAttribute('aria-checked', 'true');

    const guest = card.locator('[data-email="jordan.lee@fabrikam.example"]');
    await expect(guest.getByText('Jordan Lee', { exact: true })).toBeVisible();
    await expect(
      guest.getByRole('checkbox', { name: /Contoso Coffee Roasters Ltd/ })
    ).toBeChecked();
    await expect(guest.getByRole('checkbox', { name: /Contoso Wholesale Ltd/ })).not.toBeChecked();

    // The seeded guest entry predates the picker: it has no Entra object id and matches by email.
    await expect(guest.getByText(/Matched by email/)).toBeVisible();
    await expect(card.getByLabel('Email')).toHaveCount(0);
  });

  test('adds a person from the directory people picker, grants and removes them', async ({
    page,
  }) => {
    await page.goto('/portal/settings');
    const card = page.locator('section', {
      has: page.getByRole('heading', { name: 'People and access' }),
    });
    const person = card.locator('[data-email="sam.taylor@contoso.example"]');
    // A retried run may find Sam left over from a failed attempt: start clean.
    if (await person.count()) {
      await person.getByRole('button', { name: 'Remove Sam Taylor' }).click();
      await page.getByTestId('confirm-action').click();
      await expect(person).toHaveCount(0);
    }

    const picker = page.getByRole('combobox', { name: 'Add a person' });
    await picker.fill('s');
    // The people picker's own list; Settings has other drop-downs (Email › Agent) with options.
    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(0);

    // Search as you type: name, email and Member/Guest, keyboard to choose.
    await picker.fill('sam');
    const option = page.getByRole('listbox').getByRole('option', { name: /Sam Taylor/ });
    await expect(option).toBeVisible();
    await expect(option).toContainText('sam.taylor@contoso.example');
    await expect(option).toContainText('Member');
    await picker.fill('fabrikam');
    await expect(
      page.getByRole('listbox').getByRole('option', { name: /Jordan Lee/ })
    ).toContainText('Guest');
    await expect(
      page.getByRole('listbox').getByRole('option', { name: /Jordan Lee/ })
    ).toContainText('Already listed');
    await picker.fill('nobody-like-this');
    await expect(card.getByTestId('combobox-message')).toHaveText(/No one in .* directory matches/);

    await picker.fill('sam');
    await expect(
      page.getByRole('listbox').getByRole('option', { name: /Sam Taylor/ })
    ).toHaveAttribute('aria-selected', 'true');
    await picker.press('Enter');
    await expect(person.getByText('No organisations')).toBeVisible();
    await expect(picker).toHaveValue('');
    await expect(person).toHaveAttribute('data-user-id', /^[0-9a-f-]{36}$/);

    // Sam isn't assigned to Bookie in the demo directory, so he can't sign in yet.
    const hint = person.getByTestId('sign-in-hint');
    await expect(hint).toContainText(
      'Can’t sign in yet: an administrator needs to assign them to Bookie in Microsoft Entra'
    );
    await expect(hint.getByRole('link', { name: /Enterprise applications/ })).toHaveAttribute(
      'href',
      /^https:\/\/entra\.microsoft\.com\//
    );

    await person.getByRole('checkbox', { name: /Contoso Wholesale Ltd/ }).check();
    await person.getByRole('button', { name: 'Save access' }).click();
    await expect(person.getByText('1 organisation')).toBeVisible();

    await page.reload();
    await expect(person.getByRole('checkbox', { name: /Contoso Wholesale Ltd/ })).toBeChecked();

    await person.getByRole('button', { name: 'Remove Sam Taylor' }).click();
    await page.getByTestId('confirm-action').click();
    await expect(person).toHaveCount(0);
  });
});
