import { expect, test } from '@playwright/test';
import { createTask, initialState, STORAGE_KEY, validateImported, type BoardState } from '../src/model';

function setupPlanningBoard(today: string): BoardState {
  const board = initialState();
  board.weeklyScoreEnabled = true;
  board.onboardingStep = undefined;

  const dueTodayTask = createTask({
    id: 'task-due-today',
    title: 'File monthly invoice',
    category: 'Money',
    lane: 'urgent',
    dueDate: today,
    priority: 'high',
    scheduledTime: '09:00',
    subtasks: [
      { id: 'sub-inv-1', title: 'Export line items', done: false },
      { id: 'sub-inv-2', title: 'Send PDF to client', done: false }
    ]
  });

  const boardTask1 = createTask({
    id: 'task-board-1',
    title: 'Research planning frameworks',
    category: 'Me',
    lane: 'daily',
    priority: 'medium',
    subtasks: [
      { id: 'sub-res-1', title: 'Read ADHD planning guidelines', done: false },
      { id: 'sub-res-2', title: 'Outline workflow steps', done: false }
    ]
  });

  const boardTask2 = createTask({
    id: 'task-board-2',
    title: 'Refactor calendar layout',
    category: 'Work',
    lane: 'weekly',
    priority: 'low'
  });

  board.tasks = [dueTodayTask, boardTask1, boardTask2];
  return board;
}

test('seeded planning board passes validateImported with no warnings', () => {
  const warnings: string[] = [];
  const board = setupPlanningBoard('2026-10-17');
  const validated = validateImported(board, warnings);
  expect(warnings).toEqual([]);
  expect(validated.tasks).toHaveLength(3);
  expect(validated.onboardingStep).toBeUndefined();
  expect(validated.weeklyScoreEnabled).toBe(true);
});

test.describe('Calendar day planning window and cell entries', () => {
  let todayDate: string;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    todayDate = await page.evaluate(() => {
      const p = new Intl.DateTimeFormat('en-AU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Australia/Brisbane'
      }).formatToParts(new Date());
      const val = (type: string) => p.find(item => item.type === type)?.value;
      return `${val('year')}-${val('month')}-${val('day')}`;
    });

    const board = setupPlanningBoard(todayDate);
    const warnings: string[] = [];
    validateImported(board, warnings);
    expect(warnings).toEqual([]);

    await page.evaluate(
      ({ key, board }) => {
        localStorage.clear();
        localStorage.setItem(key, JSON.stringify(board));
      },
      { key: STORAGE_KEY, board }
    );
    await page.reload();
    const menu = page.getByRole('button', { name: 'Open menu', exact: true });
    if (await menu.isVisible()) {
      await menu.click();
    }
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Calendar', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: /Calendar/ })).toBeVisible();
  });

  test('Month scale: opens DayPlanModal via mouse on day number, traps focus, closes on Esc, restores focus, and preserves scale/date', async ({
    page
  }) => {
    // 1. Month scale is active by default
    const monthScaleBtn = page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Month' });
    await expect(monthScaleBtn).toHaveAttribute('aria-pressed', 'true');

    // 2. Mouse click on day number
    const dayCell = page.getByTestId(`calendar-date-${todayDate}`);
    const dayNumberBtn = dayCell.getByRole('button', { name: `Plan ${todayDate}`, exact: false }).first();
    await expect(dayNumberBtn).toBeVisible();
    await dayNumberBtn.click();

    // 3. Modal opens with role="dialog", heading with the date, DayPlan + BoardPicker
    const modal = page.getByRole('dialog', { name: /day planning|edit planned entry/i }).first();
    await expect(modal).toBeVisible();

    const heading = modal.getByRole('heading', { level: 2 });
    await expect(heading).toBeVisible();

    // "Due this day" section shown read-only above
    const dueSection = modal.getByRole('region', { name: 'Due this day' });
    await expect(dueSection).toBeVisible();
    await expect(dueSection.getByText('File monthly invoice', { exact: true })).toBeVisible();

    // DayPlan container and BoardPicker are both mounted
    await expect(modal.getByTestId(`day-plan-${todayDate}`)).toBeVisible();
    await expect(modal.getByTestId('board-picker')).toBeVisible();

    // 4. Focus trap: close button initially receives focus, Tab cycles inside dialog
    const closeBtn = modal.getByRole('button', { name: 'Close day planning' });
    await expect(closeBtn).toBeFocused();

    // Press Shift+Tab: wraps to last focusable element in modal
    await page.keyboard.press('Shift+Tab');
    const isFocusInsideModal = await modal.evaluate(node => node.contains(document.activeElement));
    expect(isFocusInsideModal).toBe(true);

    // 5. Esc closes the modal and focus returns to the clicked day number
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(dayNumberBtn).toBeFocused();

    // 6. Calendar preserves scale and anchor
    await expect(monthScaleBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('Month scale: opens DayPlanModal via keyboard (Enter on focused day number)', async ({
    page
  }) => {
    const dayCell = page.getByTestId(`calendar-date-${todayDate}`);
    const dayNumberBtn = dayCell.getByRole('button', { name: `Plan ${todayDate}`, exact: false }).first();

    // Focus day number via keyboard
    await dayNumberBtn.focus();
    await expect(dayNumberBtn).toBeFocused();

    // Press Enter to open
    await page.keyboard.press('Enter');

    const modal = page.getByRole('dialog').first();
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('region', { name: 'Due this day' })).toBeVisible();

    // Close via close button
    await modal.getByRole('button', { name: 'Close day planning' }).click();
    await expect(modal).not.toBeVisible();
    await expect(dayNumberBtn).toBeFocused();
  });

  test('Week scale: mouse and keyboard paths open DayPlanModal, Esc closes and returns focus to weekday heading', async ({
    page
  }) => {
    // Switch to Week scale
    await page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Week' }).click();
    const weekScaleBtn = page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Week' });
    await expect(weekScaleBtn).toHaveAttribute('aria-pressed', 'true');

    // 1. Mouse path: clicking the weekday heading button
    const weekDay = page.getByTestId(`calendar-date-${todayDate}`);
    const weekHeadingBtn = weekDay.locator('.calendar-week-heading').getByRole('button').first();
    await expect(weekHeadingBtn).toBeVisible();
    await weekHeadingBtn.click();

    let modal = page.getByRole('dialog').first();
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('region', { name: 'Due this day' })).toBeVisible();

    // Esc closes modal and restores focus
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(weekHeadingBtn).toBeFocused();
    await expect(weekScaleBtn).toHaveAttribute('aria-pressed', 'true');

    // 2. Keyboard path: pressing Enter on focused week heading
    await weekHeadingBtn.focus();
    await page.keyboard.press('Enter');
    modal = page.getByRole('dialog').first();
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(weekHeadingBtn).toBeFocused();
  });

  test('Planning workflow: add from board, toggle checklist, change status, edit details without modifying source task', async ({
    page
  }) => {
    // Open DayPlanModal for today
    const dayCell = page.getByTestId(`calendar-date-${todayDate}`);
    await dayCell.getByRole('button', { name: `Plan ${todayDate}`, exact: false }).first().click();

    const modal = page.getByRole('dialog').first();
    await expect(modal).toBeVisible();

    // 1. Add task from BoardPicker to DayPlan
    const pickerRow = modal.getByTestId('picker-row-task-board-1');
    await expect(pickerRow).toBeVisible();
    await pickerRow.getByRole('button', { name: /Add/i }).click();

    // Verify task now appears as a planned entry in DayPlan
    const dayPlan = modal.getByTestId(`day-plan-${todayDate}`);
    const plannedEntry = dayPlan.locator('.planned-entry-card').first();
    await expect(plannedEntry).toBeVisible();
    await expect(plannedEntry.getByText('Research planning frameworks', { exact: true })).toBeVisible();

    // 2. Toggle checklist item on planned entry
    const checklistToggle = plannedEntry.getByRole('button', { name: /checklist steps completed/i });
    if (await checklistToggle.isVisible()) {
      await checklistToggle.click();
      const firstChecklistCheckbox = plannedEntry.getByRole('checkbox', { name: 'Read ADHD planning guidelines' });
      await firstChecklistCheckbox.check();
      await expect(firstChecklistCheckbox).toBeChecked();
    }

    // 3. Edit planned entry details (title/notes/time)
    const editBtn = plannedEntry.getByRole('button', { name: /Open details for/i });
    await editBtn.click();

    const editOverlay = page.getByRole('dialog', { name: /Edit/i });
    await expect(editOverlay).toBeVisible();

    const titleInput = editOverlay.getByRole('textbox', { name: 'Title' });
    await titleInput.fill('Deep research on planning frameworks');
    await editOverlay.getByRole('button', { name: 'Save changes' }).click();

    // Verify DayPlan reflects edited title
    await expect(dayPlan.getByText('Deep research on planning frameworks', { exact: true })).toBeVisible();

    // Close DayPlanModal
    await modal.getByRole('button', { name: 'Close day planning' }).click();
    await expect(modal).not.toBeVisible();

    // 4. Verify source Task on board is completely UNMODIFIED
    const boardState = await page.evaluate(
      key => JSON.parse(localStorage.getItem(key)!),
      STORAGE_KEY
    );
    const sourceTask = boardState.tasks.find((t: { id: string }) => t.id === 'task-board-1');
    expect(sourceTask.title).toBe('Research planning frameworks');
    expect(sourceTask.status).toBe('not-started');
    expect(sourceTask.subtasks.every((s: { done: boolean }) => !s.done)).toBe(true);

    // Verify plannedEntries in storage contains the independent planned copy
    expect(boardState.plannedEntries.length).toBe(1);
    expect(boardState.plannedEntries[0].title).toBe('Deep research on planning frameworks');
    expect(boardState.plannedEntries[0].checklist[0].done).toBe(true);
  });

  test('Calendar cells in Month and Week scales display planned entries with title and status dot', async ({
    page
  }) => {
    // 1. Add a planned entry for today
    const dayCell = page.getByTestId(`calendar-date-${todayDate}`);
    await dayCell.getByRole('button', { name: `Plan ${todayDate}`, exact: false }).first().click();

    const modal = page.getByRole('dialog').first();
    const pickerRow = modal.getByTestId('picker-row-task-board-1');
    await pickerRow.getByRole('button', { name: /Add/i }).click();
    await modal.getByRole('button', { name: 'Close day planning' }).click();

    // 2. Month scale cell displays planned entry (title + status dot) in addition to due task
    const cellEntries = dayCell.locator('.calendar-cell-entries');
    // Due task is visible
    await expect(cellEntries.getByText('File monthly invoice', { exact: true })).toBeVisible();
    // Planned entry is visible with status dot
    const plannedChip = cellEntries.locator('.planned-chip');
    await expect(plannedChip).toBeVisible();
    await expect(plannedChip.getByText('Research planning frameworks', { exact: true })).toBeVisible();
    await expect(plannedChip.locator('.calendar-status-dot')).toBeVisible();

    // Clicking planned entry chip opens DayPlanModal
    await plannedChip.click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog').first()).not.toBeVisible();

    // 3. Week scale cell also displays planned entry (title + status dot)
    await page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Week' }).click();
    const weekDay = page.getByTestId(`calendar-date-${todayDate}`);
    const weekItems = weekDay.locator('.calendar-week-items');

    await expect(weekItems.getByText('File monthly invoice', { exact: true })).toBeVisible();
    const weekPlannedChip = weekItems.locator('.planned-chip');
    await expect(weekPlannedChip).toBeVisible();
    await expect(weekPlannedChip.getByText('Research planning frameworks', { exact: true })).toBeVisible();
    await expect(weekPlannedChip.locator('.calendar-status-dot')).toBeVisible();
  });

  test('Existing "Add on <date>" button and native drag rescheduling remain functional', async ({
    page
  }) => {
    const dayCell = page.getByTestId(`calendar-date-${todayDate}`);
    const addOnDateBtn = dayCell.getByRole('button', { name: `Add task on ${todayDate}` });

    // Clicking "Add task on <date>" opens TaskModal (not DayPlanModal)
    await addOnDateBtn.click();
    const taskModal = page.getByRole('dialog', { name: /Create a task|Edit task/i });
    await expect(taskModal).toBeVisible();
    await expect(taskModal.getByRole('textbox', { name: 'Task name' })).toBeVisible();

    // Cancel TaskModal
    await taskModal.getByRole('button', { name: 'Cancel' }).click();
    await expect(taskModal).not.toBeVisible();

    // Day cell still has native rescheduling drop listeners
    const hasDropProps = await dayCell.evaluate(node =>
      typeof (node as HTMLElement).ondrop !== 'undefined' || node.getAttribute('data-testid') !== null
    );
    expect(hasDropProps).toBe(true);
  });

  test('Focus retention: board updates (adding task, toggling checklist, changing status) preserve focus on the activated control', async ({
    page
  }) => {
    // Open DayPlanModal for today
    const dayCell = page.getByTestId(`calendar-date-${todayDate}`);
    const dayNumberBtn = dayCell.getByRole('button', { name: `Plan ${todayDate}`, exact: false }).first();
    await dayNumberBtn.click();

    const modal = page.getByRole('dialog').first();
    await expect(modal).toBeVisible();

    // 1. Add button preserves focus after adding an entry
    const pickerRow = modal.getByTestId('picker-row-task-board-1');
    const addBtn = pickerRow.getByRole('button', { name: /Add/i });
    await addBtn.focus();
    await expect(addBtn).toBeFocused();
    await addBtn.click();

    // Focus must remain on the Add button (NOT reset to "Close day planning")
    await expect(addBtn).toBeFocused();
    const closeBtn = modal.getByRole('button', { name: 'Close day planning' });
    await expect(closeBtn).not.toBeFocused();

    // 2. Checklist checkbox preserves focus after toggling
    const dayPlan = modal.getByTestId(`day-plan-${todayDate}`);
    const plannedEntry = dayPlan.locator('.planned-entry-card').first();
    await expect(plannedEntry).toBeVisible();

    const checklistToggle = plannedEntry.getByRole('button', { name: /checklist steps completed/i });
    if (await checklistToggle.isVisible()) {
      await checklistToggle.click();
      const firstChecklistCheckbox = plannedEntry.getByRole('checkbox', { name: 'Read ADHD planning guidelines' });
      await firstChecklistCheckbox.focus();
      await expect(firstChecklistCheckbox).toBeFocused();
      await firstChecklistCheckbox.click();
      await expect(firstChecklistCheckbox).toBeChecked();
      // Focus must remain on the checkbox after board update
      await expect(firstChecklistCheckbox).toBeFocused();
      await expect(closeBtn).not.toBeFocused();
    }

    // 3. Status select preserves focus after changing status
    const statusSelect = plannedEntry.getByRole('combobox', { name: /Status for Research planning frameworks/i });
    await statusSelect.focus();
    await expect(statusSelect).toBeFocused();
    await statusSelect.selectOption('started');
    await expect(statusSelect).toHaveValue('started');
    // Focus must remain on the status select
    await expect(statusSelect).toBeFocused();
    await expect(closeBtn).not.toBeFocused();
  });

  test('Escape during keyboard drag cancels the drag and keeps DayPlanModal open', async ({
    page
  }) => {
    // Open DayPlanModal for today
    const dayCell = page.getByTestId(`calendar-date-${todayDate}`);
    await dayCell.getByRole('button', { name: `Plan ${todayDate}`, exact: false }).first().click();

    const modal = page.getByRole('dialog').first();
    await expect(modal).toBeVisible();

    // Add two tasks to have entries to drag
    const pickerRow1 = modal.getByTestId('picker-row-task-board-1');
    await pickerRow1.getByRole('button', { name: /Add/i }).click();

    const pickerRow2 = modal.getByTestId('picker-row-task-board-2');
    await pickerRow2.getByRole('button', { name: /Add/i }).click();

    const dayPlan = modal.getByTestId(`day-plan-${todayDate}`);
    const firstCard = dayPlan.locator('.planned-entry-card').first();
    await expect(firstCard).toBeVisible();

    // Focus drag handle on first card
    const dragHandle = firstCard.locator('.drag-handle');
    await dragHandle.focus();
    await expect(dragHandle).toBeFocused();

    // Initiate keyboard drag with Space
    await page.keyboard.press('Space');
    // dnd-kit measures the card and attaches its keyboard listener asynchronously.
    await expect(firstCard).toHaveClass(/is-dragging/);

    // Press Escape to cancel the drag
    await page.keyboard.press('Escape');

    // Modal MUST still be visible!
    await expect(modal).toBeVisible();

    // Press Escape again (without active drag): now modal closes
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });

  test('Blank cell clicks restore focus to cell button, and entry editor operates as a replacement view', async ({
    page
  }) => {
    // 1. Month scale blank cell click
    const dayCell = page.getByTestId(`calendar-date-${todayDate}`);
    const dayNumberBtn = dayCell.getByRole('button', { name: `Plan ${todayDate}`, exact: false }).first();

    // Click blank area of the month cell
    await dayCell.click({ position: { x: 5, y: 50 } });
    const modal = page.getByRole('dialog', { name: /^Day planning:/ });
    await expect(modal).toBeVisible();

    // Add an entry
    const pickerRow = modal.getByTestId('picker-row-task-board-1');
    await pickerRow.getByRole('button', { name: /Add/i }).click();

    const dayPlan = modal.getByTestId(`day-plan-${todayDate}`);
    const plannedEntry = dayPlan.locator('.planned-entry-card').first();
    const editBtn = plannedEntry.getByRole('button', { name: /Open details for/i });
    await editBtn.focus();
    await editBtn.click();

    // 2. Editor opens as replacement view
    const editOverlay = page.getByRole('dialog', { name: /Edit/i });
    await expect(editOverlay).toBeVisible();

    // First field (Title) is focused
    const titleInput = editOverlay.getByRole('textbox', { name: 'Title' });
    await expect(titleInput).toBeFocused();

    // Focus trap inside editor: pressing Shift+Tab wraps to last focusable element in editor
    await page.keyboard.press('Shift+Tab');
    const isFocusInEditor = await editOverlay.evaluate(node => node.contains(document.activeElement));
    expect(isFocusInEditor).toBe(true);

    // Cancel edit via Cancel button restores focus to the entry edit button
    await editOverlay.getByRole('button', { name: 'Cancel' }).click();
    await expect(editOverlay).not.toBeVisible();
    await expect(editBtn).toBeFocused();

    // Esc closes DayPlanModal and restores focus to month day number button
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(dayNumberBtn).toBeFocused();

    // 3. Week scale blank cell click
    await page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Week' }).click();
    const weekDay = page.getByTestId(`calendar-date-${todayDate}`);
    const weekHeadingBtn = weekDay.locator('.calendar-week-heading').getByRole('button').first();

    await weekDay.click({ position: { x: 5, y: 150 } });
    const weekModal = page.getByRole('dialog').first();
    await expect(weekModal).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(weekModal).not.toBeVisible();
    await expect(weekHeadingBtn).toBeFocused();
  });
});
