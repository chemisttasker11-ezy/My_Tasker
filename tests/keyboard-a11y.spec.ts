import { expect, test, type Locator, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { createTask, initialState, STORAGE_KEY } from '../src/model';

const views = ['Overview', 'My task board', 'Today', 'Week planner', 'Calendar', 'Upcoming', 'Long-term goals', 'Completed', 'Archived tasks', 'Life task library', 'Printable tracker', 'Direction & quotes', 'Settings & backup'];
const require = createRequire(import.meta.url);
let axePath: string | undefined;
try { axePath = require.resolve('@axe-core/playwright'); } catch { /* Optional dependency: never install it for these specs. */ }

async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 100; i++) {
    if (await target.evaluate(el => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}
test.beforeEach(async ({ page }) => {
  const board = initialState(); board.onboardingStep = undefined;
  board.tasks = [createTask({ id: 'keyboard', title: 'Keyboard task' })];
  await page.goto('/');
  await page.evaluate(({ key, board }) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(board)); }, { key: STORAGE_KEY, board });
  await page.reload();
});
test('from skip link every navigation item is reachable by Tab with visible focus', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeVisible();
  for (const view of views) {
    const button = page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${view.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s*\\d+)?$`) });
    await page.keyboard.press('Tab'); await expect(button).toBeFocused();
    expect(await button.evaluate(el => {
      const css = getComputedStyle(el);
      return (css.outlineStyle !== 'none' && parseFloat(css.outlineWidth) > 0) || css.boxShadow !== 'none';
    })).toBe(true);
  }
});
test('keyboard creates and saves a task, traps modal focus, and opens/closes card actions', async ({ page }) => {
  await page.keyboard.press('Tab');
  await tabTo(page, page.getByRole('button', { name: 'New task', exact: true }));
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Create a task', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Task name', exact: true })).toBeFocused();
  await page.keyboard.type('Created with keyboard');
  // Cross both boundaries with Tab and Shift+Tab; focus must remain in the modal.
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
  }
  await tabTo(page, dialog.getByRole('button', { name: 'Create task', exact: true }));
  await page.keyboard.press('Enter'); await expect(dialog).toHaveCount(0);
  await tabTo(page, page.getByRole('navigation').getByRole('button', { name: 'My task board', exact: true }));
  await page.keyboard.press('Enter');
  const title = page.getByRole('button', { name: 'Created with keyboard', exact: true });
  await tabTo(page, title); await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Task name', exact: true })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('Saved with keyboard');
  await tabTo(page, page.getByRole('button', { name: 'Save changes', exact: true }));
  await page.keyboard.press('Enter');
  const more = page.getByRole('button', { name: 'More options for Saved with keyboard', exact: true });
  await tabTo(page, more); await page.keyboard.press('Enter');
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await tabTo(page, page.getByRole('button', { name: 'Edit task', exact: true }));
  await page.keyboard.press('Escape');
  await expect(more).toHaveAttribute('aria-expanded', 'false'); await expect(more).toBeFocused();
  await page.reload(); await page.getByRole('button', { name: 'My task board', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved with keyboard', exact: true })).toBeVisible();
});
for (const view of views) {
  test(`axe: ${view} has no serious or critical violations`, async ({ page }) => {
    test.skip(!axePath, '@axe-core/playwright is not installed; optional scan skipped without installing.');
    const { default: AxeBuilder } = await import(axePath!);
    await page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${view}(?:\\s*\\d+)?$`) }).click();
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v: { impact: string }) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  });
}
