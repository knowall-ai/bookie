import { expect, test } from '@playwright/test';

const ORG = '/portal/demo.contoso';

test.describe('home activity chart', () => {
  test('shows a year of activity with a total, legend and month labels', async ({ page }) => {
    await page.goto(ORG);
    const chart = page.getByTestId('activity-chart');
    await expect(chart.getByRole('heading', { name: 'Activity' })).toBeVisible();
    await expect(chart.getByText(/documents and payments in the last 12 months/)).toBeVisible();
    await expect(chart.getByText('Less')).toBeVisible();
    await expect(chart.getByText('More')).toBeVisible();
    // 52-53 weeks of days.
    expect(await chart.locator('rect[data-date]').count()).toBeGreaterThanOrEqual(365);
    await expect(chart.locator('svg text', { hasText: 'Mon' })).toHaveCount(1);
  });

  test('shows a tooltip per day and filters with the chips', async ({ page }) => {
    await page.goto(ORG);
    const chart = page.getByTestId('activity-chart');
    const active = chart.locator('a rect[data-count]').last();
    await active.hover();
    await expect(page.getByRole('tooltip')).toHaveText(/^\d{1,2} \w{3,4} \d{4}: \d+ \w+/);

    const all = await chart.locator('rect[data-count]:not([data-count="0"])').count();
    await chart.getByRole('button', { name: 'Purchases' }).click();
    await expect(chart.getByRole('button', { name: 'Purchases' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(chart.getByText(/bills? in the last 12 months/)).toBeVisible();
    const purchases = await chart.locator('rect[data-count]:not([data-count="0"])').count();
    expect(purchases).toBeGreaterThan(0);
    expect(purchases).toBeLessThan(all);
  });

  test('clicking a day opens that day’s invoices', async ({ page }) => {
    await page.goto(ORG);
    const chart = page.getByTestId('activity-chart');
    await chart.getByRole('button', { name: 'Sales' }).click();
    // A day with an invoice (quotes alone would open an empty list).
    const day = chart.getByRole('link', { name: /\d invoices?/ }).last();
    const date = await day.locator('rect').getAttribute('data-date');
    await day.click();
    await expect(page).toHaveURL(new RegExp(`/sales/invoices\\?from=${date}&to=${date}$`));
    const chip = page.getByText(/^Dated \d{1,2} \w{3,4} \d{4}$/);
    await expect(chip).toBeVisible();
    const shown = (await chip.textContent())!.replace('Dated ', '');
    // Every row is dated that day.
    const rows = page.getByRole('table').locator('tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(rows.filter({ hasNotText: shown })).toHaveCount(0);
  });
});
