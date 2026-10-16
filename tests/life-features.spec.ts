import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const artifacts = path.resolve('.local-run/validation');
test.beforeEach(async ({ page }) => {
  await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload();
});
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
}
test('starter routines are detailed, editable, persistent and only added once', async ({ page }) => {
  await navigate(page, 'Life task library');
  await page.getByRole('button', { name: 'Add starter set (12)' }).click();
  await expect(page.getByRole('button', { name: 'Starter set added' })).toBeDisabled();
  await navigate(page, 'My task board');
  await page.getByRole('button', { name: 'Start the day with intention', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue(/Suggested timing:/);
  await expect(page.getByRole('checkbox', { name: /Mark .* complete/ })).toHaveCount(5);
  await page.getByRole('textbox', { name: 'Task name' }).fill('My morning ritual');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.reload(); await navigate(page, 'Life task library');
  await expect(page.getByRole('button', { name: 'Starter set added' })).toBeDisabled();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('my-command-centre:v1')!));
  expect(state.tasks).toHaveLength(38); expect(state.tasks.filter((t: { title: string }) => t.title === 'My morning ritual')).toHaveLength(1);
});

test('areas can be added, renamed and removed with safe reassignment', async ({ page }) => {
  await navigate(page, 'Settings & backup');
  await page.getByRole('textbox', { name: 'Area name' }).fill('Home');
  await page.getByRole('button', { name: 'Add area', exact: true }).click();
  await page.getByRole('button', { name: 'Rename area Finance', exact: true }).click();
  await page.getByRole('textbox', { name: 'Area name' }).fill('Money');
  await page.getByRole('button', { name: 'Save area name', exact: true }).click();
  await navigate(page, 'My task board');
  await page.getByRole('combobox', { name: 'Filter by category' }).selectOption('Money');
  await expect(page.getByRole('button', { name: 'Tax', exact: true })).toBeVisible();
  await navigate(page, 'Settings & backup');
  await page.getByRole('button', { name: 'Remove area Money', exact: true }).click();
  await page.getByRole('combobox', { name: 'Move tasks and history to' }).selectOption('Home');
  await page.getByRole('button', { name: 'Move tasks and remove area' }).click();
  await navigate(page, 'My task board');
  await expect(page.getByRole('combobox', { name: 'Filter by category' })).toHaveValue('All');
  await page.getByRole('button', { name: 'Tax', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Area of life' })).toHaveValue('Home');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload();
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('my-command-centre:v1')!));
  expect(data.areas.some((a: { id: string }) => a.id === 'Money')).toBe(false); expect(data.tasks).toHaveLength(26);
});

test('custom direction and daily quote persist and travel in backups', async ({ page }) => {
  await navigate(page, 'Direction & quotes');
  await page.getByRole('textbox', { name: 'Your direction quote' }).fill('Family, purpose and a little adventure.');
  await page.getByRole('button', { name: 'Save direction', exact: true }).click();
  await page.getByRole('textbox', { name: 'Custom quote', exact: true }).fill('Make today a kind beginning.');
  await page.getByRole('button', { name: 'Save custom quote', exact: true }).click();
  await page.getByRole('combobox', { name: 'Quote theme' }).selectOption('My quotes');
  await page.getByRole('button', { name: /^Use for / }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Daily inspiration' }).getByText('Family, purpose and a little adventure.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Daily inspiration' }).getByText('Make today a kind beginning.')).toBeVisible();
  await navigate(page, 'Settings & backup');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const download = await downloaded;
  const backup = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(backup.quotes.direction).toBe('Family, purpose and a little adventure.'); expect(backup.quotes.custom).toHaveLength(1);
});

test('day, week, month and year trackers export a complete single PDF page', async ({ page }) => {
  test.setTimeout(90_000); await mkdir(artifacts, { recursive: true });
  await navigate(page, 'Life task library'); await page.getByRole('button', { name: 'Add starter set (12)' }).click();
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByRole('textbox', { name: 'Task name' }).fill('Scheduled tracker check');
  await page.getByLabel('Due date (optional)', { exact: true }).fill('2026-10-16');
  await page.getByRole('combobox', { name: 'Repeat' }).selectOption('daily');
  await page.getByRole('button', { name: 'Create task' }).click();
  await navigate(page, 'Printable tracker'); await page.getByLabel('Tracker date').fill('2026-10-16');
  for (const scale of ['Day', 'Week', 'Month', 'Year']) {
    await page.getByRole('group', { name: 'Tracker period' }).getByRole('button', { name: scale, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled();
    await expect(page.getByRole('img', { name: /^Complete/ })).toBeVisible();
    const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const download = await downloaded; const file = path.join(artifacts, `${scale.toLowerCase()}.pdf`); await download.saveAs(file);
    const pdf = await PDFDocument.load(await readFile(file)); expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
    await page.screenshot({ path: path.join(artifacts, `tracker-${scale.toLowerCase()}.png`) });
  }
  await page.getByLabel('Include checklists').check();
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('postpone panel stays within its completed card and does not overlap the next card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, 'My task board');
  const card = page.getByTestId('task-notebook-1');
  await card.getByRole('combobox', { name: 'Status for Tax' }).selectOption('finished');
  await card.getByRole('combobox', { name: 'Status for Tax' }).selectOption('postponed');
  const popup = card.getByRole('group', { name: 'Postpone Tax' });
  await expect(popup.getByRole('button', { name: 'Move', exact: true })).toBeVisible();
  const c = (await card.boundingBox())!, p = (await popup.boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(c.x); expect(p.x + p.width).toBeLessThanOrEqual(c.x + c.width + 1);
  expect(p.y + p.height).toBeLessThanOrEqual(c.y + c.height + 1);
  const next = (await page.getByTestId('task-notebook-2').boundingBox())!; expect(next.y).toBeGreaterThanOrEqual(c.y + c.height);
  await popup.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('new screens fit narrow and wide viewports in both colour themes', async ({ page }) => {
  test.setTimeout(90_000);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['Life task library', 'Direction & quotes', 'Settings & backup', 'Printable tracker']) {
      await navigate(page, name);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
    }
    await page.getByRole('button', { name: 'Toggle light or dark theme' }).click();
    await navigate(page, 'My task board');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  }
});
