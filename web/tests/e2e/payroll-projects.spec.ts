import { expect, test } from '@playwright/test';

/** Runs against the demo organisations (BOOKIE_DEV_AUTH=demo). */
const ORG = '/portal/demo.contoso';

test('payroll redirects to employees and lists the demo staff', async ({ page }) => {
  await page.goto(`${ORG}/payroll`);
  await expect(page).toHaveURL(/\/payroll\/employees$/);
  await expect(page.getByRole('heading', { name: 'Employees' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Ada Fairweather' })).toBeVisible();
  await page.getByRole('tab', { name: 'Left' }).click();
  await expect(page.getByRole('cell', { name: 'Felix Marchetti' })).toBeVisible();
});

test('pay runs shows six monthly runs', async ({ page }) => {
  await page.goto(`${ORG}/payroll/pay-runs`);
  await expect(page.getByRole('heading', { name: 'Pay runs' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.getByText('Draft')).toBeVisible();
});

test('projects list has In progress and Closed tabs and opens a project', async ({ page }) => {
  await page.goto(`${ORG}/projects`);
  await expect(page.getByRole('tab', { name: 'In progress' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.getByRole('cell', { name: 'Hotel breakfast blend rollout' })).toBeVisible();
  await page.getByRole('tab', { name: 'Closed' }).click();
  await expect(page.getByRole('cell', { name: 'Office coffee subscription pilot' })).toBeVisible();
  await page.getByRole('cell', { name: 'Office coffee subscription pilot' }).click();
  await expect(
    page.getByRole('heading', { name: /Office coffee subscription pilot/ })
  ).toBeVisible();
});
