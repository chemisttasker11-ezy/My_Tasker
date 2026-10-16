import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('weekly planner supports deliberate commitments and weighted status', async ({ page }) => {
  await page.getByRole('button', { name: 'Week planner' }).click();
  await expect(page.getByRole('heading', { name: 'Plan your week' })).toBeVisible();
  await expect(page.getByText('Not scored')).toBeVisible();
  const source = page.locator('.plan-source-card').filter({ hasText: 'Family time' }).first();
  await source.getByRole('button', { name: /Add Family time to/ }).click();
  await expect(page.getByText('0/100')).toBeVisible();
  const planned = page.locator('[data-testid^="plan-entry-"]').filter({ hasText: 'Family time' }).first();
  await planned.getByRole('combobox', { name: /Status for planned Family time/ }).selectOption('progressing');
  await expect(page.getByText('60/100')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Week planner' }).click();
  await expect(page.getByText('60/100')).toBeVisible();
  await page.getByRole('button', { name: 'Save weekly review' }).click();
  await expect(page.getByText(/Review saved/)).toBeVisible();
});

test('today view limits focus choices to three without marking tasks completed', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Today\b/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Add .* to today's top three/ }).first().click();
  await expect(page.getByText('3/3 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: /Add .* to today's top three/ }).first()).toBeDisabled();
  await page.getByRole('button', { name: /Remove .* from today's top three/ }).first().click();
  await expect(page.getByText('2/3 selected')).toBeVisible();
});
