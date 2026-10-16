import { expect, test } from '@playwright/test';
import { createTask, initialState, STORAGE_KEY } from '../src/model';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload(); });

test('fresh installs have empty boards, two-step setup and optional scores', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Getting started' })).toContainText('Step 1 of 2');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Getting started' })).toContainText('Step 2 of 2');
  await page.getByRole('button', { name: 'Explore starter templates' }).click();
  await page.getByRole('button', { name: 'Add starter set (12)' }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).tasks.length, STORAGE_KEY)).toBe(12);
  await page.getByRole('button', { name: 'Settings & backup' }).click();
  await expect(page.getByRole('checkbox', { name: 'Show weekly scores' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Show weekly scores' }).check();
  await page.reload(); await page.getByRole('button', { name: 'Week planner', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Weekly progress and scoring' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings & backup' }).click();
  await page.getByRole('checkbox', { name: 'Show weekly scores' }).uncheck();
  await page.getByRole('button', { name: 'Week planner', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Weekly progress and scoring' })).toHaveCount(0);
});

test('corrupt data stays untouched until confirmed recovery', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key, '{broken'), STORAGE_KEY); await page.reload();
  await expect(page.getByRole('heading', { name: 'Recover your board' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('{broken');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download raw data' }).click(); await download;
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Start fresh' }).click();
  await expect(page.getByRole('heading', { name: 'Recover your board' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Start fresh' }).click();
  await expect(page.getByRole('heading', { name: 'Recover your board' })).toHaveCount(0);
  expect(await page.evaluate(key => Object.keys(localStorage).some(k => k.startsWith(`${key}:recovery-`) && localStorage.getItem(k) === '{broken'), STORAGE_KEY)).toBe(true);
});

test('import previews counts and backs up before replacement', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings & backup' }).click();
  const board = initialState(); board.tasks = [createTask({ title: 'Imported task' })];
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('1 tasks, 6 areas and 0 history'); await dialog.accept(); });
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(board)) });
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).tasks[0]?.title, STORAGE_KEY)).toBe('Imported task');
  expect(await page.evaluate(key => Object.keys(localStorage).some(k => k.startsWith(`${key}:backup-`)), STORAGE_KEY)).toBe(true);
});

test('quota failure keeps unsaved work and displays a persistent banner', async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'New task', exact: true }).click(); await page.getByRole('textbox', { name: 'Task name' }).fill('Unsaved task');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Browser storage is unavailable or full');
  await page.getByRole('button', { name: 'My task board', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unsaved task', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('a stale tab edit keeps the draft and applies nothing', async ({ page }) => {
  const original = initialState(); original.onboardingStep = undefined;
  await page.evaluate(({ key, board }) => localStorage.setItem(key, JSON.stringify(board)), { key: STORAGE_KEY, board: original }); await page.reload();
  // A same-tab storage write deliberately does not dispatch a storage event, reproducing an unseen concurrent write.
  await page.evaluate(key => { const board = JSON.parse(localStorage.getItem(key)!); board.revision = 8; board.tasks = []; board.theme = 'dark'; localStorage.setItem(key, JSON.stringify(board)); }, STORAGE_KEY);
  await page.getByRole('button', { name: 'New task', exact: true }).click(); await page.getByRole('textbox', { name: 'Task name' }).fill('Stale edit');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(page.getByText('Your draft is kept; save again to apply it.')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).tasks, STORAGE_KEY)).toEqual([]);
});

test('direction banner appears only on Overview and Today', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Daily inspiration' })).toBeVisible();
  await page.getByRole('button', { name: 'My task board', exact: true }).click(); await expect(page.getByRole('region', { name: 'Daily inspiration' })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: /^Today/ }).click(); await expect(page.getByRole('region', { name: 'Daily inspiration' })).toBeVisible();
});


test('postponed tasks return to Today on their due date', async ({ page }) => {
  const board = initialState();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  board.tasks = [createTask({ title: 'Ready again', status: 'postponed', dueDate: today })];
  await page.evaluate(({ key, board }) => localStorage.setItem(key, JSON.stringify(board)), { key: STORAGE_KEY, board }); await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: /^Today/ }).click();
  await expect(page.getByRole('main').getByText('Ready again', { exact: true })).toBeVisible();
});

test('a failed lazy tracker load offers saved data and reload', async ({ page }) => {
  await page.route('**/src/views/TrackerView.tsx*', route => route.abort());
  await page.getByRole('button', { name: 'Printable tracker', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Something interrupted your planner' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download my data', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
});


for (const choice of ['Use mine', 'Keep theirs'] as const) {
  test(`an editor opened before a cross-tab task edit preserves its draft and offers ${choice}`, async ({ page, context }) => {
    const board = initialState(); board.onboardingStep = undefined;
    board.tasks = [createTask({ title: 'Original task' })];
    await page.evaluate(({ key, board }) => localStorage.setItem(key, JSON.stringify(board)), { key: STORAGE_KEY, board });
    await page.reload();
    await page.getByRole('button', { name: 'My task board', exact: true }).click();
    await page.getByRole('button', { name: 'Original task', exact: true }).click();
    await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('My preserved draft');

    const otherTab = await context.newPage();
    await otherTab.goto('/');
    await otherTab.getByRole('button', { name: 'My task board', exact: true }).click();
    await otherTab.getByRole('button', { name: 'Original task', exact: true }).click();
    await otherTab.getByRole('textbox', { name: 'Task name', exact: true }).fill('Their task edit');
    await otherTab.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Updated board loaded from another tab.' })).toBeVisible();

    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const conflict = page.getByRole('dialog', { name: 'This task changed in another tab', exact: true });
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText('My preserved draft');
    const keepTheirs = conflict.getByRole('button', { name: 'Keep theirs', exact: true });
    const useMine = conflict.getByRole('button', { name: 'Use mine', exact: true });
    await expect(keepTheirs).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(useMine).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(keepTheirs).toBeFocused();
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).tasks[0].title, STORAGE_KEY)).toBe('Their task edit');
    await page.keyboard.press('Escape');
    await expect(conflict).toBeVisible();
    await conflict.getByRole('button', { name: choice, exact: true }).click();
    await expect(conflict).toHaveCount(0);
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).tasks[0].title, STORAGE_KEY)).toBe(choice === 'Use mine' ? 'My preserved draft' : 'Their task edit');
    await otherTab.close();
  });
}
