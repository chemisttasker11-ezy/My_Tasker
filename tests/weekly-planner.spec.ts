import { CATEGORIES, createTask, initialState } from '../src/model';
function legacyBoard() {
  const board = initialState(); board.areas = CATEGORIES; board.weeklyScoreEnabled = true; board.onboardingStep = undefined;
  board.tasks = Array.from({ length: 26 }, (_, i) => createTask({ id: `notebook-${i + 1}`, title: i === 0 ? 'Tax' : i === 5 ? 'Family time' : `Legacy task ${i + 1}`, category: i === 0 ? 'Finance' : 'Family', lane: i < 4 ? 'urgent' : 'daily' }));
  return board;
}
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(board => { localStorage.clear(); localStorage.setItem('my-command-centre:v1', JSON.stringify(board)); }, legacyBoard());
  await page.reload();
});

test('weekly planner supports explicit commitments and weighted status scores', async ({ page }) => {
  await page.getByRole('button', { name: 'Week planner' }).click();
  await expect(page.getByRole('heading', { name: 'Plan your week' })).toBeVisible();
  await expect(page.getByText('Not scored')).toBeVisible();
  await page.getByRole('button', { name: /Add task on/ }).first().click();
  await page.getByRole('textbox', { name: 'Task name' }).fill('Review release');
  await page.getByRole('button', { name: 'Create task' }).click();
  await page.getByRole('button', { name: 'Add to plan' }).first().click();
  await expect(page.getByText('0/100')).toBeVisible();
  await page.getByRole('button', { name: 'Review release' }).first().click();
  await page.getByRole('combobox', { name: 'Task status' }).selectOption('progressing');
  await page.getByRole('button', { name: 'Save changes' }).click();
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
