import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { createTask, initialState, STORAGE_KEY } from '../src/model';

async function seed(page: Page, titles: string[], dense = false) {
  const board = initialState(); board.onboardingStep = undefined;
  board.tasks = titles.map((title, i) => createTask({ id: `pdf-${i}`, title, dueDate: '2026-10-17', recurrence: 'daily', lane: 'daily',
    subtasks: dense ? Array.from({ length: 10 }, (_, s) => ({ id: `step-${i}-${s}`, title: `Step ${s + 1} for task ${i + 1}`, done: false })) : [] }));
  await page.goto('/');
  await page.evaluate(({ key, board }) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(board)); }, { key: STORAGE_KEY, board });
  await page.reload(); await page.getByRole('button', { name: 'Printable tracker', exact: true }).click();
  await page.getByLabel('Tracker date', { exact: true }).fill('2026-10-17');
}
async function downloadPdf(page: Page, scale: string) {
  const button = page.getByRole('button', { name: 'Download PDF', exact: true });
  await expect(button).toBeEnabled();
  const downloading = page.waitForEvent('download'); await button.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`my-planner-${scale}-2026-10-17.pdf`);
  expect(await download.failure()).toBeNull();
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
}
for (const scale of ['day', 'week', 'month', 'year']) {
  test(`${scale} downloads a one-page PDF`, async ({ page }) => {
    await seed(page, ['Read a chapter', 'Take a walk']);
    await page.getByRole('group', { name: 'Tracker period' }).getByRole('button', { name: scale[0].toUpperCase() + scale.slice(1), exact: true }).click();
    await expect(page.getByRole('img', { name: new RegExp(`^Complete ${scale} tracker`) })).toBeVisible();
    await downloadPdf(page, scale);
  });
}
test('emoji produces a clear unsupported-character warning and still exports', async ({ page }) => {
  await seed(page, ['Read 📚']);
  await expect(page.getByRole('alert')).toContainText('embedded PDF font cannot render');
  await expect(page.getByRole('alert')).toContainText('📚');
  await downloadPdf(page, 'day');
});
test('very dense board warns that tasks did not fit and still exports one page', async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page, Array.from({ length: 400 }, (_, i) => `Dense task ${i + 1}: read, reflect and plan the next meaningful step`), true);
  await page.getByRole('group', { name: 'Tracker period' }).getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByLabel('Include checklists', { exact: true }).check();
  await expect(page.getByRole('alert').filter({ hasText: "didn't fit" })).toContainText(/\d+ (tasks?|steps?).*didn't fit/);
  await downloadPdf(page, 'day');
});
