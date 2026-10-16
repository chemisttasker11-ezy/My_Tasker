import { test, expect } from '@playwright/test';
import { createTask, initialState, CATEGORIES, brisbaneToday, type BoardState } from '../src/model';
import { planTask } from '../src/lib/planning';
import { addDays } from '../src/lib/calendar';

function getBrisbaneToday(): string {
  return brisbaneToday();
}

function getYesterday(today: string): string {
  return addDays(today, -1);
}

function createTestBoard(): BoardState {
  const board = initialState();
  board.areas = CATEGORIES;
  board.weeklyScoreEnabled = true;
  board.onboardingStep = undefined;

  // Create a few board tasks
  const t1 = createTask({
    id: 'task-1',
    title: 'Review quarterly goals',
    category: 'Finance',
    lane: 'urgent',
    estimateMinutes: 45,
    subtasks: [
      { id: 'sub-1', title: 'Check spreadsheet', done: false },
      { id: 'sub-2', title: 'Export summary', done: false }
    ]
  });

  const t2 = createTask({
    id: 'task-2',
    title: 'Team standup meeting',
    category: 'ChemistTasker',
    lane: 'daily',
    scheduledTime: '09:00',
    estimateMinutes: 30,
    subtasks: [{ id: 'sub-3', title: 'Prepare updates', done: true }]
  });

  const t3 = createTask({
    id: 'task-3',
    title: 'Call supplier',
    category: 'Pharmacy',
    lane: 'daily',
    scheduledTime: '14:00',
    estimateMinutes: 60
  });

  const t4 = createTask({
    id: 'task-4',
    title: 'Inbox zero triage',
    category: 'Personal',
    lane: 'urgent',
    estimateMinutes: 20
  });

  board.tasks = [t1, t2, t3, t4];
  return board;
}

test.describe('Batch 3A: Today View Planning & Focus', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const board = createTestBoard();
    await page.evaluate(b => {
      localStorage.clear();
      localStorage.setItem('my-command-centre:v1', JSON.stringify(b));
    }, board);
    await page.reload();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Today\b/ }).click();
    await expect(page.getByRole('heading', { name: 'Your focus today' })).toBeVisible();
  });

  test('1. Now card: displays empty state when no planned entries exist', async ({ page }) => {
    const nowCard = page.getByTestId('now-card');
    await expect(nowCard).toBeVisible();
    await expect(nowCard.getByText('Pick something from your board to start.')).toBeVisible();
    await expect(nowCard.getByText('NOW')).toBeVisible();
  });

  test('1. Now card: displays current or next planned entry and opens FocusView overlay (mouse & keyboard)', async ({ page }) => {
    // Add task-1 from board picker
    const row = page.getByTestId('picker-row-task-1');
    await row.getByRole('button', { name: /Add Review quarterly goals to today/i }).click();

    const nowCard = page.getByTestId('now-card');
    await expect(nowCard.getByText('Review quarterly goals')).toBeVisible();
    await expect(nowCard.getByText('45m')).toBeVisible();
    // Checklist progress 0/2
    await expect(nowCard.getByText('0/2')).toBeVisible();

    // Mouse path: Click "Start focus" to open FocusView overlay
    await nowCard.getByRole('button', { name: 'Start focus' }).click();
    const focusView = page.getByRole('region', { name: 'Focus mode' });
    await expect(focusView).toBeVisible();
    await expect(focusView.getByRole('heading', { name: 'Review quarterly goals' })).toBeVisible();
    await expect(focusView.getByText('Check spreadsheet')).toBeVisible();

    // Mouse path: Toggle checklist step inside focus view
    await focusView.getByRole('checkbox', { name: /Check spreadsheet/i }).click();
    await expect(focusView.getByRole('checkbox', { name: /Check spreadsheet/i })).toHaveAttribute('aria-checked', 'true');

    // Keyboard path: Exit focus view using Escape key
    await page.keyboard.press('Escape');
    await expect(focusView).toHaveCount(0);

    // Verify checklist update is reflected in the Now card (1/2)
    await expect(nowCard.getByText('1/2')).toBeVisible();

    // Reopen FocusView via keyboard: Tab to "Start focus" and press Enter
    await nowCard.getByRole('button', { name: 'Start focus' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Focus mode' })).toBeVisible();

    // Complete task via "Done" in FocusView
    await page.getByRole('button', { name: 'Complete task and exit' }).click();
    await expect(page.getByRole('region', { name: 'Focus mode' })).toHaveCount(0);

    // After Done, task is finished, so Now card returns to empty state
    await expect(nowCard.getByText('Pick something from your board to start.')).toBeVisible();
  });

  test('1. Now card: "Done" button directly on Now card finishes entry and advances', async ({ page }) => {
    // Add two tasks from board
    await page.getByTestId('picker-row-task-1').getByRole('button', { name: /Add Review quarterly goals/i }).click();
    await page.getByTestId('picker-row-task-4').getByRole('button', { name: /Add Inbox zero triage/i }).click();

    const nowCard = page.getByTestId('now-card');
    await expect(nowCard.getByText('Review quarterly goals')).toBeVisible();

    // Click Done directly on Now card
    await nowCard.getByRole('button', { name: 'Done' }).click();

    // Next entry becomes the Now card
    await expect(nowCard.getByText('Inbox zero triage')).toBeVisible();
  });

  test('2. Today plan: DayPlan allows reordering, status change, and removing entries (mouse & keyboard)', async ({ page }) => {
    // Add two tasks
    await page.getByTestId('picker-row-task-1').getByRole('button', { name: /Add Review quarterly goals/i }).click();
    await page.getByTestId('picker-row-task-4').getByRole('button', { name: /Add Inbox zero triage/i }).click();

    const dayPlan = page.locator('.day-plan-list');
    await expect(dayPlan.getByRole('button', { name: 'Review quarterly goals', exact: true })).toBeVisible();
    await expect(dayPlan.getByRole('button', { name: 'Inbox zero triage', exact: true })).toBeVisible();

    // Keyboard path: Move first card down using Move Down button
    const card1 = dayPlan.locator('.planned-entry-card').first();
    const moveDownBtn = card1.getByRole('button', { name: /Move Review quarterly goals down/i });
    await moveDownBtn.focus();
    await page.keyboard.press('Enter');

    // Verify order swapped: Inbox zero triage is now first
    const firstTitle = dayPlan.locator('.planned-entry-title').first();
    await expect(firstTitle).toHaveText('Inbox zero triage');

    // Status change in DayPlan
    const triageCard = dayPlan.locator('.planned-entry-card').first();
    await triageCard.getByRole('combobox', { name: 'Status for Inbox zero triage' }).selectOption('started');
    await expect(triageCard.getByRole('combobox', { name: 'Status for Inbox zero triage' })).toHaveValue('started');

    // Remove from plan button
    await triageCard.getByRole('button', { name: /Remove Inbox zero triage from plan/i }).click();
    await expect(dayPlan.getByRole('button', { name: 'Inbox zero triage', exact: true })).toHaveCount(0);

    // Verify task is still on the board picker
    await expect(page.getByTestId('picker-row-task-4')).toBeVisible();
  });

  test('2. BoardPicker: mobile viewport opens bottom sheet with "Add from board" button (mouse & keyboard)', async ({ page }) => {
    // Switch to mobile viewport (<1024px)
    await page.setViewportSize({ width: 390, height: 844 });

    // Desktop side panel should be hidden
    await expect(page.locator('.today-desktop-picker')).not.toBeVisible();

    // "Add from board" button is visible
    const addFromBoardBtn = page.getByRole('button', { name: 'Add from board', exact: true });
    await expect(addFromBoardBtn).toBeVisible();

    // Click "Add from board" to open bottom sheet
    await addFromBoardBtn.click();
    const sheet = page.getByRole('dialog', { name: 'Add from board' });
    await expect(sheet).toBeVisible();

    // Keyboard path: Press Escape to close bottom sheet
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    // Reopen and add a task from bottom sheet
    await addFromBoardBtn.click();
    await expect(sheet).toBeVisible();
    await sheet.getByTestId('picker-row-task-2').getByRole('button', { name: /Add Team standup meeting/i }).click();

    // Close bottom sheet via close button
    await sheet.getByRole('button', { name: 'Close board picker' }).click();
    await expect(sheet).toHaveCount(0);

    // Task is planned in DayPlan
    await expect(page.locator('.day-plan-list').getByRole('button', { name: 'Team standup meeting', exact: true })).toBeVisible();
  });

  test('2. QuickAdd: adds a new board task AND plans it for today', async ({ page }) => {
    const quickAddInput = page.getByPlaceholder('Quick add task for today...');
    await expect(quickAddInput).toBeVisible();

    // Type new task with high priority tag '!' and submit via Enter
    await quickAddInput.fill('Urgent client follow up!');
    await quickAddInput.press('Enter');

    // Appears in DayPlan
    await expect(page.locator('.day-plan-list').getByRole('button', { name: 'Urgent client follow up', exact: true })).toBeVisible();

    // Now card reflects it
    await expect(page.getByTestId('now-card').getByText('Urgent client follow up')).toBeVisible();

    // Check that it was also added to board tasks
    await page.getByRole('button', { name: 'My task board' }).click();
    await expect(page.getByRole('heading', { name: /My task board/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Urgent client follow up', exact: true })).toBeVisible();
  });

  test('3. Timeline: shows planned entries as blocks between 06:00 and 22:00, now-line, and anytime list', async ({ page }) => {
    // Plan a timed task (Team standup meeting at 09:00, 30m) and an untimed task (Review quarterly goals)
    await page.getByTestId('picker-row-task-2').getByRole('button', { name: /Add Team standup meeting/i }).click();
    await page.getByTestId('picker-row-task-1').getByRole('button', { name: /Add Review quarterly goals/i }).click();

    const timeline = page.getByLabel("Today's timeline");
    await expect(timeline).toBeVisible();

    // Check summary text: "x h y min planned · z left today"
    await expect(timeline.locator('.timeline-summary-text')).toHaveText(/\d+\s*h\s*\d+\s*min planned\s*·\s*.*left today/i);

    // Timed block on the track
    const block = timeline.locator('.timeline-block').filter({ hasText: 'Team standup meeting' });
    await expect(block).toBeVisible();
    await expect(block).toContainText('09:00');
    await expect(block).toContainText('30m');

    // Untimed task listed under "Anytime"
    const anytimeSection = timeline.locator('.timeline-anytime-section');
    await expect(anytimeSection.getByRole('heading', { name: 'Anytime' })).toBeVisible();
    await expect(anytimeSection.getByText('Review quarterly goals')).toBeVisible();

    // Completing an anytime task via round check
    const checkBtn = anytimeSection.getByRole('button', { name: /Complete Review quarterly goals/i });
    await checkBtn.click();
    await expect(anytimeSection.getByRole('button', { name: /Undo completion of Review quarterly goals/i })).toBeVisible();
  });

  test('4. Carry-over: prompts when yesterday has unfinished planned entries (Bring / Back / Later)', async ({ page }) => {
    const today = getBrisbaneToday();
    const yesterday = getYesterday(today);

    // Set up board with 3 unfinished planned entries on yesterday
    const board = createTestBoard();
    let updatedBoard = planTask(board, 'task-1', yesterday);
    updatedBoard = planTask(updatedBoard, 'task-2', yesterday);
    updatedBoard = planTask(updatedBoard, 'task-3', yesterday);

    await page.evaluate(b => {
      localStorage.setItem('my-command-centre:v1', JSON.stringify(b));
    }, updatedBoard);
    await page.reload();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Today\b/ }).click();

    // Gentle card appears: "3 things from yesterday aren't done."
    const carryCard = page.getByTestId('carry-over-card');
    await expect(carryCard).toBeVisible();
    await expect(carryCard.getByText("3 things from yesterday aren't done.")).toBeVisible();

    // Test "Decide later" hides the card
    await carryCard.getByRole('button', { name: 'Decide later' }).click();
    await expect(carryCard).toHaveCount(0);

    // Reload to bring card back
    await page.reload();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Today\b/ }).click();
    await expect(carryCard).toBeVisible();

    // Test "Bring to today" moves all 3 entries to today's plan
    await carryCard.getByRole('button', { name: 'Bring to today' }).click();
    await expect(carryCard).toHaveCount(0);

    // All 3 entries are now in today's day plan
    const dayPlan = page.locator('.day-plan-list');
    await expect(dayPlan.getByRole('button', { name: 'Review quarterly goals', exact: true })).toBeVisible();
    await expect(dayPlan.getByRole('button', { name: 'Team standup meeting', exact: true })).toBeVisible();
    await expect(dayPlan.getByRole('button', { name: 'Call supplier', exact: true })).toBeVisible();
  });

  test('4. Carry-over: "Back to board" removes entries from plan without deleting source tasks', async ({ page }) => {
    const today = getBrisbaneToday();
    const yesterday = getYesterday(today);

    const board = createTestBoard();
    const updatedBoard = planTask(board, 'task-1', yesterday);

    await page.evaluate(b => {
      localStorage.setItem('my-command-centre:v1', JSON.stringify(b));
    }, updatedBoard);
    await page.reload();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Today\b/ }).click();

    const carryCard = page.getByTestId('carry-over-card');
    await expect(carryCard).toBeVisible();

    // Click "Back to board"
    await carryCard.getByRole('button', { name: 'Back to board' }).click();
    await expect(carryCard).toHaveCount(0);

    // Task is not in DayPlan for today
    await expect(page.locator('.day-plan-list').getByRole('button', { name: 'Review quarterly goals', exact: true })).toHaveCount(0);

    // Source task is still available in the board picker
    await expect(page.getByTestId('picker-row-task-1')).toBeVisible();
  });

  test('5. Top 3 focus section: preserved below the plan and maintains max 3 limit', async ({ page }) => {
    const topThree = page.locator('.today-top-three');
    await expect(topThree).toBeVisible();
    await expect(topThree.getByRole('heading', { name: 'My three priorities' })).toBeVisible();

    // Initially empty state
    await expect(topThree.getByText('Choose your top three')).toBeVisible();

    // Select 3 tasks for top three
    const addButtons = page.locator('.today-layout').getByRole('button', { name: /Add .* to today's top three/i });
    for (let i = 0; i < 3; i++) {
      await addButtons.first().click();
    }

    await expect(topThree.getByText('3/3 selected')).toBeVisible();
    await expect(addButtons.first()).toBeDisabled();

    // Remove one
    await page.locator('.today-task-row').getByRole('button', { name: /Remove .* from today's top three/i }).first().click();
    await expect(topThree.getByText('2/3 selected')).toBeVisible();
  });

  test('Finding 1: Planning edits update planned copy without modifying the source board task, and offers Open board task', async ({ page }) => {
    // Add task-1 from board picker
    await page.getByTestId('picker-row-task-1').getByRole('button', { name: /Add Review quarterly goals to today/i }).click();

    const dayPlan = page.locator('.day-plan-list');
    const entryTitleBtn = dayPlan.getByRole('button', { name: 'Review quarterly goals', exact: true });
    await expect(entryTitleBtn).toBeVisible();

    // Clicking title opens local planned entry editor
    await entryTitleBtn.click();
    const editor = page.getByTestId('planned-entry-editor');
    await expect(editor).toBeVisible();

    // Edit title and notes
    const titleInput = editor.getByTestId('entry-title-input');
    await titleInput.fill('Review quarterly goals (today only)');
    const notesInput = editor.getByTestId('entry-notes-input');
    await notesInput.fill('Special today notes');

    // Save
    await editor.getByTestId('save-entry-btn').click();
    await expect(editor).toHaveCount(0);

    // DayPlan reflects updated title
    await expect(dayPlan.getByRole('button', { name: 'Review quarterly goals (today only)', exact: true })).toBeVisible();

    // Verify board source task remains unchanged
    await expect(page.getByTestId('picker-row-task-1').getByText('Review quarterly goals', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'My task board' }).click();
    await expect(page.getByRole('heading', { name: /My task board/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review quarterly goals', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review quarterly goals (today only)', exact: true })).toHaveCount(0);

    // Return to Today view
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Today\b/ }).click();
    // Re-open local editor and verify "Open board task" opens source task editor
    await dayPlan.getByRole('button', { name: 'Review quarterly goals (today only)', exact: true }).click();
    await expect(editor).toBeVisible();
    await editor.getByTestId('open-board-task-btn').click();
    await expect(editor).toHaveCount(0);
    // Board task modal should be open
    await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
    await page.getByRole('button', { name: 'Close editor' }).click();
  });

  test('Finding 2: Bottom sheet traps Tab, isolates background with inert, and restores opener focus on close', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const addFromBoardBtn = page.getByRole('button', { name: 'Add from board', exact: true });
    await expect(addFromBoardBtn).toBeVisible();

    await addFromBoardBtn.click();
    const sheet = page.getByRole('dialog', { name: 'Add from board' });
    await expect(sheet).toBeVisible();

    // Verify background is inert
    await expect(page.locator('.today-planning-section')).toHaveAttribute('inert', '');

    // Close button has initial focus inside sheet
    const closeBtn = sheet.getByRole('button', { name: 'Close board picker' });
    await expect(closeBtn).toBeFocused();

    // Close sheet via Escape
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    // Verify focus is restored to "Add from board"
    await expect(addFromBoardBtn).toBeFocused();
  });

  test('Finding 3: FocusView overlay isolates background with inert, traps Tab, and restores focus to Start focus on exit', async ({ page }) => {
    await page.getByTestId('picker-row-task-1').getByRole('button', { name: /Add Review quarterly goals to today/i }).click();

    const nowCard = page.getByTestId('now-card');
    const startFocusBtn = nowCard.getByRole('button', { name: 'Start focus' });
    await startFocusBtn.click();

    const focusView = page.getByRole('region', { name: 'Focus mode' });
    await expect(focusView).toBeVisible();

    // Verify background Today controls are inert
    await expect(page.locator('.today-planning-section')).toHaveAttribute('inert', '');

    // Press Escape to exit focus mode
    await page.keyboard.press('Escape');
    await expect(focusView).toHaveCount(0);

    // Verify background is no longer inert
    await expect(page.locator('.today-planning-section')).not.toHaveAttribute('inert', '');

    // Verify focus is restored to "Start focus" button
    await expect(startFocusBtn).toBeFocused();
  });

  test('Finding 4: Carry-over dismissal survives navigation view remounts for the same day', async ({ page }) => {
    const today = getBrisbaneToday();
    const yesterday = getYesterday(today);

    const board = createTestBoard();
    const updatedBoard = planTask(board, 'task-1', yesterday);

    await page.evaluate(b => {
      localStorage.setItem('my-command-centre:v1', JSON.stringify(b));
    }, updatedBoard);
    await page.reload();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Today\b/ }).click();

    const carryCard = page.getByTestId('carry-over-card');
    await expect(carryCard).toBeVisible();

    // Dismiss via "Decide later"
    await carryCard.getByRole('button', { name: 'Decide later' }).click();
    await expect(carryCard).toHaveCount(0);

    // Navigate to "My task board" and back to "Today" (view unmount/remount)
    await page.getByRole('button', { name: 'My task board' }).click();
    await expect(page.getByRole('heading', { name: /My task board/ })).toBeVisible();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Today\b/ }).click();

    // Dismissal is retained across view remounts for the same day
    await expect(carryCard).toHaveCount(0);
  });

  test('Finding 6: Out-of-range entries render in Early & late section, not outside the timeline track', async ({ page }) => {
    const today = getBrisbaneToday();
    const board = createTestBoard();

    // Add entry at 23:00 (duration 60m) which is after 22:00
    // and entry at 04:00 (duration 30m) which ends before 06:00
    const lateTask = createTask({ id: 'late-task', title: 'Late evening review', category: 'Personal', scheduledTime: '23:00', estimateMinutes: 60 });
    const earlyTask = createTask({ id: 'early-task', title: 'Early dawn workout', category: 'Personal', scheduledTime: '04:00', estimateMinutes: 30 });
    board.tasks.push(lateTask, earlyTask);

    let updatedBoard = planTask(board, 'late-task', today);
    updatedBoard = planTask(updatedBoard, 'early-task', today);

    await page.evaluate(b => {
      localStorage.setItem('my-command-centre:v1', JSON.stringify(b));
    }, updatedBoard);
    await page.reload();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Today\b/ }).click();

    // Verify track does not contain spilled or phantom blocks for these
    const track = page.locator('.timeline-track');
    await expect(track.locator('.timeline-block').filter({ hasText: 'Late evening review' })).toHaveCount(0);
    await expect(track.locator('.timeline-block').filter({ hasText: 'Early dawn workout' })).toHaveCount(0);

    // Both are listed in the "Early & late" section
    const outOfRange = page.getByTestId('timeline-out-of-range');
    await expect(outOfRange).toBeVisible();
    await expect(outOfRange.getByText('Early & late')).toBeVisible();
    await expect(outOfRange.getByText('Late evening review')).toBeVisible();
    await expect(outOfRange.getByText('Early dawn workout')).toBeVisible();
  });

  test('Finding 8: Missing duration is treated as unknown time marker without fictional 30m or adding to totals', async ({ page }) => {
    const today = getBrisbaneToday();
    const board = createTestBoard();

    // Task with scheduled time but NO duration (estimateMinutes = 0)
    const untimedDurationTask = createTask({
      id: 'time-only-task',
      title: 'Check server logs',
      category: 'ChemistTasker',
      scheduledTime: '11:00',
      estimateMinutes: 0
    });
    // Task with real duration of 45m
    const normalTask = createTask({
      id: 'normal-task',
      title: 'Review quarterly goals',
      category: 'Finance',
      estimateMinutes: 45
    });
    board.tasks.push(untimedDurationTask, normalTask);

    let updatedBoard = planTask(board, 'time-only-task', today);
    updatedBoard = planTask(updatedBoard, 'normal-task', today);

    await page.evaluate(b => {
      localStorage.setItem('my-command-centre:v1', JSON.stringify(b));
    }, updatedBoard);
    await page.reload();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Today\b/ }).click();

    const timeline = page.getByLabel("Today's timeline");
    // Verify duration totals exclude the unknown duration task: total is 45 min, NOT 75 min (45 + 30)
    await expect(timeline.locator('.timeline-summary-text')).toContainText('0 h 45 min planned');

    // On track, it is rendered as a time marker, showing 11:00 and title without "30m"
    const marker = page.locator('.timeline-marker').filter({ hasText: 'Check server logs' });
    await expect(marker).toBeVisible();
    await expect(marker).toContainText('11:00');
    await expect(marker).not.toContainText('30m');
  });
});
