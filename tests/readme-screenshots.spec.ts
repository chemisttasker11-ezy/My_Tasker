import { expect, test, type Page } from '@playwright/test';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createTask, initialState, STORAGE_KEY, validateImported, type BoardState, type Task } from '../src/model';
import { addDays, mondayOf } from '../src/lib/calendar';

// Run explicitly: CAPTURE_SCREENSHOTS=1 npx playwright test tests/readme-screenshots.spec.ts
test.skip(!process.env.CAPTURE_SCREENSHOTS);
test.use({ viewport: { width: 1440, height: 900 }, timezoneId: 'Australia/Brisbane', colorScheme: 'light', reducedMotion: 'reduce', deviceScaleFactor: 1, actionTimeout: 10_000 });

const today = '2026-10-14';
const now = '2026-10-14T09:10:00+10:00';
const output = path.resolve('docs/screenshots');

function demoBoard(): BoardState {
  const board = initialState();
  board.onboardingStep = undefined;
  const task = (id: string, title: string, category: string, lane: Task['lane'], steps: string[], extra: Partial<Task> = {}) => ({
    ...createTask({ id, title, category, lane, recurrence: 'none', estimateMinutes: 25,
      description: 'Start small and leave room for a break.',
      subtasks: steps.map((title, i) => ({ id: `${id}-step-${i}`, title, done: false })), ...extra }),
    createdAt: now, updatedAt: now,
  });
  board.tasks = [
    task('project', 'Draft the project outline', 'Work', 'urgent', ['Gather the key ideas', 'Write a first draft', 'Choose the next step'], { priority: 'high', status: 'started', estimateMinutes: 45 }),
    task('walk', 'Take a walk outside', 'Health', 'daily', ['Fill a water bottle', 'Walk around the park'], { recurrence: 'daily', dueDate: today, scheduledTime: '12:30', estimateMinutes: 30 }),
    task('reset', 'Reset the kitchen', 'Home', 'daily', ['Clear the bench', 'Put dishes away'], { estimateMinutes: 15 }),
    task('budget', 'Review the weekly budget', 'Money', 'weekly', ['Check recent spending', 'Set aside savings'], { recurrence: 'weekly', dueDate: '2026-10-16', scheduledTime: '16:00', estimateMinutes: 30 }),
    task('check-in', 'Make time for a catch-up', 'People', 'weekly', ['Send a message', 'Pick a time together'], { estimateMinutes: 20 }),
    task('read', 'Read a chapter', 'Me', 'daily', ['Choose a quiet spot', 'Read for twenty minutes'], { estimateMinutes: 20 }),
    task('groceries', 'Plan meals and groceries', 'Home', 'weekly', ['Choose three easy meals', 'Check the pantry', 'Write the shopping list'], { estimateMinutes: 30 }),
    task('desk', 'Clear a little desk space', 'Work', 'urgent', ['Sort loose papers', 'Put supplies away'], { priority: 'low', estimateMinutes: 15 }),
    task('stretch', 'Take a gentle stretch break', 'Health', 'daily', ['Relax shoulders', 'Stretch for five minutes'], { estimateMinutes: 10 }),
    task('photos', 'Organise a few favourite photos', 'People', 'monthly', ['Choose ten favourites', 'Add them to an album'], { priority: 'low' }),
    task('subscriptions', 'Review subscriptions', 'Money', 'monthly', ['List current subscriptions', 'Keep what is useful'], { estimateMinutes: 20 }),
    task('garden', 'Refresh the balcony plants', 'Home', 'weekly', ['Check the soil', 'Water and trim'], { estimateMinutes: 20 }),
    task('learn', 'Learn something just for fun', 'Me', 'goals', ['Choose a short lesson', 'Try one new technique'], { estimateMinutes: 30 }),
    task('weekend', 'Plan a relaxed weekend outing', 'People', 'weekly', ['Find a nearby place', 'Leave some free time'], { estimateMinutes: 20 }),
    task('workspace', 'Create a calmer workspace', 'Work', 'quarterly', ['Notice what feels cluttered', 'Choose one small improvement'], { estimateMinutes: 45 }),
  ];
  const plan = (taskId: string, date: string, startTime: string, durationMin: number, status: Task['status'] = 'not-started') => {
    const source = board.tasks.find(t => t.id === taskId)!;
    board.plannedEntries!.push({ id: `plan-${taskId}-${date}`, sourceTaskId: taskId, date,
      order: board.plannedEntries!.filter(e => e.date === date).length, startTime, durationMin,
      status, title: source.title, checklist: source.subtasks.map((s, i) => ({ ...s, id: `plan-${date}-${s.id}`, done: status === 'started' && i === 0 })),
      notes: source.description, createdAt: now });
  };
  plan('project', today, '09:00', 45, 'started');
  plan('reset', today, '11:00', 15);
  plan('read', today, '17:30', 20);
  plan('desk', addDays(today, -1), '15:00', 15); // One unfinished carry-over.
  plan('groceries', mondayOf(today), '17:00', 30, 'finished');
  plan('stretch', addDays(today, -1), '12:00', 10, 'finished');
  plan('check-in', addDays(today, 1), '18:00', 20);
  plan('garden', addDays(today, 2), '08:00', 20);
  plan('weekend', addDays(today, 3), '10:00', 20);
  plan('learn', addDays(today, 4), '14:00', 30);
  board.dailyFocus[today] = ['project', 'walk', 'read'];
  const quote = 'A little progress, a little breathing room, and time for what matters.';
  board.quotes = { direction: 'Make room for a balanced life, one small step at a time.',
    custom: [{ id: 'demo-quote', text: quote, theme: 'My quotes' }], daily: { [today]: quote } };
  const warnings: string[] = [];
  const validated = validateImported(board, warnings);
  expect(warnings).toEqual([]);
  return validated;
}

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button').filter({ has: page.getByText(name, { exact: true }) }).click();
}

async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: 0, behavior: 'instant' });
    await Promise.all(Array.from(document.images, img => img.decode().catch(() => {})));
  });
  await page.mouse.move(0, 0);
  const file = path.join(output, name);
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled', caret: 'hide' });
  const { size } = await stat(file);
  expect(size, `${name} must stay below 400 KB`).toBeLessThan(400_000);
  console.log(`${name}: ${(size / 1024).toFixed(1)} KiB (${size} bytes)`);
}

test('capture the README demo screenshots', async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(output, { recursive: true });
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript(({ key, board }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(board));
  }, { key: STORAGE_KEY, board: demoBoard() });
  await page.goto('/');
  await navigate(page, 'Today');
  await expect(page.getByTestId('now-card')).toContainText('Draft the project outline');
  await expect(page.getByTestId('carry-over-card')).toBeVisible();
  await capture(page, 'today.png');

  await page.getByRole('button', { name: 'Start focus', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Focus mode', exact: true })).toBeVisible();
  await capture(page, 'focus.png');
  await page.getByRole('button', { name: 'Exit focus mode', exact: true }).click();

  await page.getByRole('button', { name: 'Toggle light or dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await capture(page, 'today-dark.png');
  await page.getByRole('button', { name: 'Toggle light or dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'today-mobile.png');
  await page.setViewportSize({ width: 1440, height: 900 });

  await navigate(page, 'My task board');
  await expect(page.getByTestId('task-project')).toBeVisible();
  await capture(page, 'board.png');
  await navigate(page, 'Week planner');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await capture(page, 'week.png');
  await navigate(page, 'Calendar');
  await expect(page.getByTestId(`calendar-date-${today}`)).toBeVisible();
  await capture(page, 'calendar.png');
  await page.getByTestId(`calendar-date-${today}`).getByRole('button', { name: `Plan ${today}`, exact: false }).first().click();
  await expect(page.getByRole('dialog', { name: /^Day planning:/ })).toBeVisible();
  await capture(page, 'calendar-day.png');
  await page.getByRole('button', { name: 'Close day planning' }).click();
  await navigate(page, 'Printable tracker');
  await page.getByRole('group', { name: 'Tracker period' }).getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled();
  await expect(page.getByRole('img', { name: /^Complete/ })).toBeVisible();
  await capture(page, 'tracker.png');
  await navigate(page, 'Settings & backup');
  await expect(page.getByRole('button', { name: 'Download backup', exact: true })).toBeVisible();
  await capture(page, 'settings.png');
});
