import { expect, test, type Page } from '@playwright/test';
import { createTask, initialState, STORAGE_KEY } from '../src/model';

async function stored(page: Page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY); }
for (const [recurrence, next, following, key, nextKey] of [
  ['daily', '2026-10-18', '2026-10-19', '2026-10-17', '2026-10-18'],
  ['weekly', '2026-10-24', '2026-10-31', '2026-10-12', '2026-10-19'],
  ['monthly', '2026-11-17', '2026-12-17', '2026-10', '2026-11'],
] as const) {
  test(`${recurrence}: one completion per period, undo, advance and retained history`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-17T02:00:00Z') });
    const board = initialState(); board.onboardingStep = undefined;
    board.tasks = [createTask({ id: 'repeat', title: 'Recurring task', recurrence, dueDate: '2026-10-17', status: 'started', subtasks: [{ id: 'step', title: 'Read', done: true }] })];
    await page.goto('/');
    await page.evaluate(({ key, board }) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(board)); }, { key: STORAGE_KEY, board });
    await page.reload(); await page.getByRole('button', { name: 'My task board', exact: true }).click();
    await page.getByRole('button', { name: 'Complete Recurring task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo completion of Recurring task', exact: true })).toBeVisible();
    let data = await stored(page);
    expect(data.completions).toHaveLength(1); expect(data.completions[0].periodKey).toBe(key);
    expect(data.tasks[0].dueDate).toBe(next); expect(data.tasks[0].subtasks[0].done).toBe(false);
    // Re-applying Finished must not create a second check-in in this period.
    await page.getByRole('combobox', { name: 'Status for Recurring task', exact: true }).selectOption('finished');
    expect((await stored(page)).completions).toHaveLength(1);
    await page.reload(); await page.getByRole('button', { name: 'My task board', exact: true }).click();
    await page.getByRole('button', { name: 'Undo completion of Recurring task', exact: true }).click();
    data = await stored(page); expect(data.completions).toHaveLength(0);
    expect(data.tasks[0].dueDate).toBe('2026-10-17'); expect(data.tasks[0].status).toBe('started'); expect(data.tasks[0].subtasks[0].done).toBe(true);
    await page.getByRole('button', { name: 'Complete Recurring task', exact: true }).click();
    const first = (await stored(page)).completions[0];
    await page.clock.setFixedTime(new Date(`${next}T02:00:00Z`));
    await page.reload(); await page.getByRole('button', { name: 'My task board', exact: true }).click();
    await page.getByRole('button', { name: 'Complete Recurring task', exact: true }).click();
    data = await stored(page); expect(data.completions).toHaveLength(2);
    expect(data.completions).toContainEqual(first);
    expect(data.completions.map((c: { periodKey: string }) => c.periodKey).sort()).toEqual([key, nextKey].sort());
    expect(data.tasks[0].dueDate).toBe(following);
    await page.reload(); await page.getByRole('navigation').getByRole('button', { name: 'Completed', exact: true }).click();
    await expect(page.getByText('2 recorded completions', { exact: true })).toBeVisible();
    await expect(page.locator('.history-row')).toHaveCount(2);
  });
}
