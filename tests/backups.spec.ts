import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { CATEGORIES, createTask, initialState, STORAGE_KEY, type BoardState } from '../src/model';

function fixture(unicode = false): BoardState {
  const board = initialState();
  board.onboardingStep = undefined;
  board.tasks = [createTask({ id: 'backup-task', title: unicode ? '読書 📚 مرحبا' : 'Backup task', description: unicode ? '家族と散歩 🌸 Привет' : 'Keep these notes', dueDate: '2026-10-17', subtasks: [{ id: 'step', title: 'First step', done: true }] })];
  board.completions = [{ id: 'history', taskId: 'backup-task', title: board.tasks[0].title, category: 'Me', completedAt: '2026-10-16T01:00:00.000Z', periodKey: '2026-10-16' }];
  board.quotes = { direction: unicode ? '前へ 🌏' : 'Keep going', custom: [{ id: 'custom', text: unicode ? '一歩ずつ 💪' : 'A small beginning', theme: 'My quotes' }], daily: { '2026-10-17': unicode ? '一歩ずつ 💪' : 'A small beginning' } };
  board.plannedEntries = [{ id: 'plan', sourceTaskId: 'backup-task', date: '2026-10-17', order: 0, title: board.tasks[0].title, status: 'started', checklist: [{ id: 'planned-step', title: 'Planned step', done: false }], createdAt: '2026-10-16T01:00:00.000Z', notes: 'Keep planned notes', startTime: '09:00', durationMin: 30 }];
  return board;
}
async function stored(page: Page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY); }
async function upload(page: Page, contents: string) {
  await page.locator('input[type=file]').setInputFiles({ name: 'board.json', mimeType: 'application/json', buffer: Buffer.from(contents) });
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(({ key, board }) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(board)); }, { key: STORAGE_KEY, board: fixture() });
  await page.reload();
  await page.getByRole('button', { name: 'Settings & backup', exact: true }).click();
});

for (const unicode of [false, true]) {
  test(`export/import preserves all records${unicode ? ' including non-Latin text and emoji' : ''}`, async ({ page }) => {
    if (unicode) {
      page.once('dialog', dialog => dialog.accept());
      await upload(page, JSON.stringify(fixture(true)));
      await expect(page.getByRole('status')).toContainText('Backup restored');
    }
    const original = await stored(page);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download backup', exact: true }).click();
    const download = await downloading;
    const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(exported).toEqual(original);
    // Make the replacement observable before restoring the exported board.
    await page.getByRole('textbox', { name: 'Area name', exact: true }).fill('Temporary');
    await page.getByRole('button', { name: 'Add area', exact: true }).click();
    const beforeImport = await stored(page);
    await page.evaluate(() => {
      const writes: string[] = [];
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { writes.push(key); return set.call(this, key, value); };
      (window as unknown as { backupWrites: string[] }).backupWrites = writes;
    });
    const confirming = page.waitForEvent('dialog');
    const uploading = upload(page, JSON.stringify(exported));
    const dialog = await confirming;
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain(`Import 1 tasks, ${original.areas.length} areas and 1 history entries?`);
    await dialog.dismiss(); await uploading;
    expect(await stored(page)).toEqual(beforeImport);
    page.once('dialog', dialog => dialog.accept());
    await upload(page, JSON.stringify(exported));
    await expect(page.getByRole('status')).toContainText('Backup restored');
    const restored = await stored(page);
    for (const key of ['tasks', 'areas', 'quotes', 'completions', 'plannedEntries']) expect(restored[key]).toEqual(original[key]);
    const writes = await page.evaluate(() => (window as unknown as { backupWrites: string[] }).backupWrites);
    const backupIndex = writes.findIndex(key => key.startsWith(`${STORAGE_KEY}:backup-`));
    expect(backupIndex).toBeGreaterThanOrEqual(0);
    expect(writes.indexOf(STORAGE_KEY)).toBeGreaterThan(backupIndex);
    expect(await page.evaluate(({ key, raw }) => Object.keys(localStorage).some(k => k.startsWith(`${key}:backup-`) && localStorage.getItem(k) === raw), { key: STORAGE_KEY, raw: JSON.stringify(beforeImport) })).toBe(true);
    await page.reload();
    const reloaded = await stored(page);
    for (const key of ['tasks', 'areas', 'quotes', 'completions', 'plannedEntries']) expect(reloaded[key]).toEqual(original[key]);
  });
}

for (const invalid of ['corrupt JSON', 'invalid timestamp']) {
  test(`${invalid} is rejected without changing the board`, async ({ page }) => {
    const before = await stored(page);
    const board = fixture(); board.tasks[0].updatedAt = 'definitely-not-a-date';
    let confirmations = 0;
    page.on('dialog', async dialog => { confirmations++; await dialog.dismiss(); });
    await upload(page, invalid === 'corrupt JSON' ? '{broken JSON' : JSON.stringify(board));
    await expect(page.getByRole('status')).toContainText(invalid === 'corrupt JSON' ? /JSON|Unexpected|property name/i : 'Backup contains invalid tasks.');
    expect(confirmations).toBe(0);
    expect(await stored(page)).toEqual(before);
    await page.reload(); expect(await stored(page)).toEqual(before);
  });
}

test('ORIGINAL format without areas, quotes or plannedEntries retains every task and completion', async ({ page }) => {
  const board = fixture(); board.tasks[0].category = CATEGORIES[0].id; board.completions[0].category = CATEGORIES[0].id;
  const { areas: _areas, quotes: _quotes, plannedEntries: _planned, ...original } = board;
  page.once('dialog', dialog => dialog.accept());
  await upload(page, JSON.stringify(original));
  await expect(page.getByRole('status')).toContainText('Backup restored');
  await page.reload();
  const restored = await stored(page);
  expect(restored.tasks).toEqual(original.tasks); expect(restored.completions).toEqual(original.completions);
  expect(restored.areas).toEqual(CATEGORIES); expect(restored.plannedEntries).toEqual([]);
});
