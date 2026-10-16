import { mondayOf } from '../src/lib/calendar';
import { planTask, updateEntry } from '../src/lib/planning';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { brisbaneToday, createTask, initialState, STORAGE_KEY, validateImported, type BoardState } from '../src/model';

function testBoard(): BoardState {
  const board = initialState();
  board.weeklyScoreEnabled = true;
  board.onboardingStep = undefined;
  board.tasks = [
    createTask({
      id: 'task-1',
      title: 'Tax invoice review',
      category: 'Money',
      lane: 'urgent',
      estimateMinutes: 45,
      subtasks: [
        { id: 'sub-1', title: 'Gather receipts', done: false },
        { id: 'sub-2', title: 'Check totals', done: false }
      ]
    }),
    createTask({
      id: 'task-2',
      title: 'Sprint planning prep',
      category: 'Work',
      lane: 'daily',
      estimateMinutes: 30,
      subtasks: [
        { id: 'sub-3', title: 'Review backlog', done: false }
      ]
    }),
    createTask({
      id: 'task-3',
      title: 'Family doctor visit',
      category: 'Health',
      lane: 'daily',
      estimateMinutes: 60
    }),
    createTask({
      id: 'task-4',
      title: 'Gym workout',
      category: 'Health',
      lane: 'daily',
      estimateMinutes: 45
    })
  ];
  return board;
}

async function dragToDay(page: Page, handle: Locator, dayPlan: Locator) {
  // Raw mouse coordinates do not auto-scroll like locator actions do.
  await handle.scrollIntoViewIfNeeded();
  const source = (await handle.boundingBox())!;
  const target = (await dayPlan.boundingBox())!;
  const viewport = page.viewportSize()!;
  const targetTop = Math.max(0, target.y);
  const targetBottom = Math.min(viewport.height, target.y + target.height);
  expect(targetBottom).toBeGreaterThan(targetTop);
  const x = source.x + source.width / 2;
  const y = source.y + source.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 12, { steps: 5 });
  await page.mouse.move(target.x + target.width / 2, (targetTop + targetBottom) / 2, { steps: 20 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  const seeded = testBoard();
  const warnings: string[] = [];
  const validated = validateImported(seeded, warnings);
  expect(warnings).toEqual([]);
  expect(validated.tasks).toHaveLength(4);

  await page.goto('/');
  await page.evaluate(({ key, board }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(board));
  }, { key: STORAGE_KEY, board: seeded });
  await page.reload();
});

test.describe('Week Planner (Batch 3B)', () => {
  test('0. seeded board passes validateImported with no warnings', () => {
    const warnings: string[] = [];
    const seeded = testBoard();
    const validated = validateImported(seeded, warnings);
    expect(warnings).toEqual([]);
    expect(validated.tasks).toHaveLength(4);
    expect(validated.weeklyScoreEnabled).toBe(true);
    expect(validated.onboardingStep).toBeUndefined();
  });

  test('1. desktop layout (>=1024px) shows all 7 days side by side with BoardPicker beside them and score card below', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
    if (page.viewportSize()!.width >= 1024) await page.getByRole('button', { name: 'Add from board', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Plan your week' })).toBeVisible();

    // 7-day planning grid and all 7 day columns visible simultaneously
    const grid = page.locator('.week-planning-days-grid');
    await expect(grid).toBeVisible();
    const dayColumns = page.locator('.week-day-column');
    await expect(dayColumns).toHaveCount(7);
    for (let i = 0; i < 7; i++) {
      await expect(dayColumns.nth(i)).toBeVisible();
    }

    // BoardPicker visible beside the days
    const sidebar = page.locator('.week-planning-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(page.getByTestId('board-picker')).toBeVisible();

    // Score card moved below the days (DC-5)
    const daysBox = await grid.boundingBox();
    const scoreSection = page.locator('.week-overview');
    await expect(scoreSection).toBeVisible();
    const scoreBox = await scoreSection.boundingBox();
    expect(scoreBox!.y).toBeGreaterThan(daysBox!.y + daysBox!.height - 100);
  });

  test('2. mobile layout (<1024px) shows day tabs, one DayPlan, and Add from board sheet', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
    if (page.viewportSize()!.width >= 1024) await page.getByRole('button', { name: 'Add from board', exact: true }).click();

    // Day tabs visible with 7 days
    const tabsList = page.getByRole('tablist', { name: 'Days of the week' });
    await expect(tabsList).toBeVisible();
    const tabs = tabsList.getByRole('tab');
    await expect(tabs).toHaveCount(7);

    // Only 1 DayPlan visible in the single day container
    const singleDayPlan = page.locator('.week-planning-single-day .day-plan-container');
    await expect(singleDayPlan).toHaveCount(1);
    await expect(singleDayPlan).toBeVisible();

    // Switching day tab updates the displayed day
    await tabs.nth(2).click(); // Click Wednesday tab
    await expect(tabs.nth(2)).toHaveClass(/is-active/);

    // Desktop sidebar hidden below 1024px
    await expect(page.locator('.week-planning-desktop')).not.toBeVisible();

    // Open "Add from board" sheet
    const openSheetBtn = page.getByRole('button', { name: 'Add from board' });
    await expect(openSheetBtn).toBeVisible();
    await openSheetBtn.click();

    // Sheet dialog opened containing BoardPicker
    const sheet = page.getByRole('dialog', { name: 'Add from board' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('board-picker')).toBeVisible();

    // Close sheet with close button
    await sheet.getByRole('button', { name: 'Close add from board' }).click();
    await expect(sheet).not.toBeVisible();
  });

  test('3. adds tasks via picker Add with day selector and drag onto days (mouse and keyboard paths)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
    if (page.viewportSize()!.width >= 1024) await page.getByRole('button', { name: 'Add from board', exact: true }).click();

    // A. Mouse path: Use picker Add button with target day selector
    const daySelector = page.locator('#desktop-picker-target-day');
    await expect(daySelector).toBeVisible();
    // Select Wednesday (index 2)
    const wednesdayOptionValue = await daySelector.locator('option').nth(2).getAttribute('value');
    await daySelector.selectOption(wednesdayOptionValue!);

    // Click "Add" button for "Tax invoice review" in the picker
    const taxPickerRow = page.getByTestId('picker-row-task-1');
    await taxPickerRow.getByRole('button', { name: /Add/ }).click();

    // Wednesday's DayPlan should now contain "Tax invoice review"
    const wednesdayDayPlan = page.locator(`[data-testid="day-plan-${wednesdayOptionValue}"]`);
    await expect(wednesdayDayPlan.getByText('Tax invoice review', { exact: true })).toBeVisible();

    // B. Keyboard path: Add task via keyboard navigation
    await daySelector.focus();
    // Press ArrowDown to select next day (Thursday)
    await page.keyboard.press('ArrowDown');
    const thursdayOptionValue = await daySelector.inputValue();

    // Tab to the picker search or Add button of "Sprint planning prep"
    const sprintPickerRow = page.getByTestId('picker-row-task-2');
    const sprintAddBtn = sprintPickerRow.getByRole('button', { name: /Add/ });
    await sprintAddBtn.focus();
    await expect(sprintAddBtn).toBeFocused();
    await page.keyboard.press('Enter');

    // Thursday's DayPlan should now contain "Sprint planning prep"
    const thursdayDayPlan = page.locator(`[data-testid="day-plan-${thursdayOptionValue}"]`);
    await expect(thursdayDayPlan.getByText('Sprint planning prep', { exact: true })).toBeVisible();

    // C. Mouse drag path: Drag picker task onto Monday's DayPlan
    const mondayOptionValue = await daySelector.locator('option').nth(0).getAttribute('value');
    const mondayDayPlan = page.locator(`[data-testid="day-plan-${mondayOptionValue}"]`);
    const doctorPickerRow = page.getByTestId('picker-row-task-3');
    const doctorDragHandle = doctorPickerRow.locator('.drag-handle');

    await dragToDay(page, doctorDragHandle, mondayDayPlan);
    await expect(mondayDayPlan.getByText('Family doctor visit', { exact: true })).toBeVisible();
  });

  test('4. moves entries between days, reorders within day (mouse and keyboard paths)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
    if (page.viewportSize()!.width >= 1024) await page.getByRole('button', { name: 'Add from board', exact: true }).click();

    const daySelector = page.locator('#desktop-picker-target-day');
    const mondayVal = await daySelector.locator('option').nth(0).getAttribute('value');
    const tuesdayVal = await daySelector.locator('option').nth(1).getAttribute('value');
    const wednesdayVal = await daySelector.locator('option').nth(2).getAttribute('value');

    // Add two tasks to Monday
    await daySelector.selectOption(mondayVal!);
    await page.getByTestId('picker-row-task-1').getByRole('button', { name: /Add/ }).click();
    await page.getByTestId('picker-row-task-2').getByRole('button', { name: /Add/ }).click();

    const mondayDayPlan = page.locator(`[data-testid="day-plan-${mondayVal}"]`);
    const mondayEntries = mondayDayPlan.locator('.planned-entry-card');
    await expect(mondayEntries).toHaveCount(2);

    // Initial order: Task 1 then Task 2
    await expect(mondayEntries.nth(0)).toContainText('Tax invoice review');
    await expect(mondayEntries.nth(1)).toContainText('Sprint planning prep');

    // A. Keyboard reorder within a day: Move down on first entry
    await mondayEntries.nth(0).getByRole('button', { name: /Actions for/ }).click();
    const actions = page.getByRole('dialog', { name: /Actions for/ });
    await actions.getByRole('button', { name: /Move .* down/ }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');

    // Order reversed: Task 2 then Task 1
    await expect(mondayEntries.nth(0)).toContainText('Sprint planning prep');
    await expect(mondayEntries.nth(1)).toContainText('Tax invoice review');

    // Move up on second entry restores order
    await mondayEntries.nth(1).getByRole('button', { name: /Actions for/ }).click();
    await actions.getByRole('button', { name: /Move .* up/ }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(mondayEntries.nth(0)).toContainText('Tax invoice review');
    await expect(mondayEntries.nth(1)).toContainText('Sprint planning prep');

    // B. Keyboard move to another day via DayPlan "Move to day..." button
    await mondayEntries.nth(0).getByRole('button', { name: /Actions for/ }).click();
    const moveToDayBtn = actions.getByRole('button', { name: /Move .* to another day/ });
    await moveToDayBtn.click();

    const dateInput = actions.locator('input[type="date"]');
    await dateInput.fill(tuesdayVal!);
    await actions.getByRole('button', { name: 'Move', exact: true }).click();

    // Verify entry moved from Monday to Tuesday
    await expect(mondayDayPlan.getByText('Tax invoice review', { exact: true })).not.toBeVisible();
    const tuesdayDayPlan = page.locator(`[data-testid="day-plan-${tuesdayVal}"]`);
    await expect(tuesdayDayPlan.getByText('Tax invoice review', { exact: true })).toBeVisible();

    // C. Drag entry between days: Drag Tuesday entry to Wednesday
    const tuesdayEntryHandle = tuesdayDayPlan.locator('.drag-handle').first();
    const wednesdayDayPlan = page.locator(`[data-testid="day-plan-${wednesdayVal}"]`);
    await dragToDay(page, tuesdayEntryHandle, wednesdayDayPlan);

    await expect(tuesdayDayPlan.getByText('Tax invoice review', { exact: true })).not.toBeVisible();
    await expect(wednesdayDayPlan.getByText('Tax invoice review', { exact: true })).toBeVisible();
  });

  test('5. "Copy to days..." on an entry: Whole week + individual checkboxes, independent checklist progress', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
    if (page.viewportSize()!.width >= 1024) await page.getByRole('button', { name: 'Add from board', exact: true }).click();

    const daySelector = page.locator('#desktop-picker-target-day');
    const mondayVal = await daySelector.locator('option').nth(0).getAttribute('value');
    const tuesdayVal = await daySelector.locator('option').nth(1).getAttribute('value');

    // Add task with subtasks to Monday
    await daySelector.selectOption(mondayVal!);
    await page.getByTestId('picker-row-task-1').getByRole('button', { name: /Add/ }).click();

    const mondayDayPlan = page.locator(`[data-testid="day-plan-${mondayVal}"]`);
    const mondayEntryCard = mondayDayPlan.locator('.planned-entry-card').first();
    await expect(mondayEntryCard).toBeVisible();

    // Open entry details modal
    await mondayEntryCard.getByRole('button', { name: 'Tax invoice review', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Planned task details' });
    await expect(modal).toBeVisible();

    // Verify "Copy to days..." section
    const wholeWeekCheckbox = modal.getByLabel('Whole week');
    await expect(wholeWeekCheckbox).toBeVisible();

    // Check "Whole week": all 7 day checkboxes should become checked
    await wholeWeekCheckbox.check();
    await expect(wholeWeekCheckbox).toBeChecked();
    for (const dayName of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      await expect(modal.getByLabel(dayName, { exact: true })).toBeChecked();
    }

    // Uncheck "Sunday": "Whole week" should become unchecked
    await modal.getByLabel('Sunday', { exact: true }).uncheck();
    await expect(wholeWeekCheckbox).not.toBeChecked();

    // Recheck "Sunday": "Whole week" becomes checked again
    await modal.getByLabel('Sunday', { exact: true }).check();
    await expect(wholeWeekCheckbox).toBeChecked();

    // Click "Copy to days"
    await modal.getByRole('button', { name: 'Copy to days', exact: true }).click();
    await expect(modal).not.toBeVisible();

    // Verify task is now planned on every day of the week
    for (let i = 0; i < 7; i++) {
      const dayVal = await daySelector.locator('option').nth(i).getAttribute('value');
      const plan = page.locator(`[data-testid="day-plan-${dayVal}"]`);
      await expect(plan.getByText('Tax invoice review').first()).toBeVisible();
    }

    // --- Test independent checklist progress ---
    // Expand Monday's checklist
    const mondayChecklistToggle = mondayDayPlan.getByRole('button', { name: /checklist steps completed/ }).first();
    await mondayChecklistToggle.click();
    const mondayGatherReceipts = mondayEntryCard.getByLabel('Gather receipts');
    await expect(mondayGatherReceipts).not.toBeChecked();

    // Complete Monday's checklist item
    await mondayGatherReceipts.check();
    await expect(mondayGatherReceipts).toBeChecked();

    // Inspect Tuesday's DayPlan: Tuesday's checklist item MUST NOT be checked
    const tuesdayDayPlan = page.locator(`[data-testid="day-plan-${tuesdayVal}"]`);
    const tuesdayChecklistToggle = tuesdayDayPlan.getByRole('button', { name: /checklist steps completed/ });
    await tuesdayChecklistToggle.click();
    const tuesdayGatherReceipts = tuesdayDayPlan.getByLabel('Gather receipts');
    await expect(tuesdayGatherReceipts).not.toBeChecked();

    // Complete Monday's planned entry
    await mondayDayPlan.getByRole('button', { name: /Actions for Tax/ }).first().click();
    const mondayCompleteBtn = page.getByRole('dialog', { name: /Actions for/ }).getByRole('button', { name: /Complete Tax invoice review/ }).first();
    await mondayCompleteBtn.click();
    await page.keyboard.press('Escape');
    await expect(mondayDayPlan.locator('.planned-entry-card').first()).toHaveClass(/is-done/);

    // Tuesday's entry must remain not-done
    await expect(tuesdayDayPlan.locator('.planned-entry-card').first()).not.toHaveClass(/is-done/);

    // Source board task must remain untouched
    await page.getByRole('navigation').getByRole('button', { name: 'My task board', exact: true }).click();
    await page.getByRole('button', { name: 'Tax invoice review', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
    const sourceSubtask = page.getByRole('dialog').getByRole('checkbox', { name: 'Mark Gather receipts complete', exact: true });
    await expect(sourceSubtask).not.toBeChecked();
  });

  test('6. preserves weekly commitments, scoring when enabled, reviews and daily focus', async ({ page }) => {
    const board = testBoard();
    board.tasks[0].dueDate = mondayOf(brisbaneToday());
    await page.evaluate(({ key, board }) => localStorage.setItem(key, JSON.stringify(board)), { key: STORAGE_KEY, board });
    await page.reload();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
    const commitments = page.locator('.week-commitments');
    await commitments.getByRole('button', { name: 'Add to plan' }).click();
    await expect(commitments).toContainText('1 selected');
    await expect(page.locator('.week-overview')).toBeVisible();
    const monday = page.getByTestId(`week-day-column-${board.tasks[0].dueDate}`);
    await monday.getByRole('button', { name: /Select Tax invoice review for top three/ }).click();
    await expect(monday.locator('.week-day-focus')).toContainText('1/3 focused');
    const review = page.locator('.week-review');
    await review.getByLabel(/What went well/).fill('Finished the important work.');
    await review.getByRole('button', { name: 'Save weekly review' }).click();
    await expect(review).toContainText('Review saved.');
    await page.evaluate(key => {
      const saved = JSON.parse(localStorage.getItem(key)!);
      saved.weeklyScoreEnabled = false;
      localStorage.setItem(key, JSON.stringify(saved));
    }, STORAGE_KEY);
    await page.reload();
    await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
    await expect(page.locator('.week-overview')).toHaveCount(0);
    await expect(commitments).toContainText('1 selected');
    await expect(monday.locator('.week-day-focus')).toContainText('1/3 focused');
    await expect(review.getByLabel(/What went well/)).toHaveValue('Finished the important work.');
  });
});

for (const width of [1024, 1280, 1440]) {
  test(`compact week fits populated columns at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
    await page.getByRole('button', { name: 'Add from board', exact: true }).click();
    const selector = page.getByLabel('Target day for added tasks');
    for (let day = 0; day < 7; day++) {
      await selector.selectOption({ index: day });
      await page.getByTestId('picker-row-task-1').getByRole('button', { name: /Add/ }).click();
    }
    await page.getByRole('button', { name: 'Close board tasks', exact: true }).click();
    await expect(page.locator('.week-day-column')).toHaveCount(7);
    const geometry = await page.locator('.week-day-column').evaluateAll(columns => columns.map(column => {
      const rect = column.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, overflow: Array.from(column.querySelectorAll('button, input, select')).filter(el => el.getClientRects().length).some(el => { const r = el.getBoundingClientRect(); return r.left < rect.left - 1 || r.right > rect.right + 1; }) };
    }));
    expect(new Set(geometry.map(rect => Math.round(rect.top))).size).toBe(1);
    for (const rect of geometry) { expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(width); expect(rect.overflow).toBe(false); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('picker keyboard drag targets a day without changing the source', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
  await page.getByRole('button', { name: 'Add from board', exact: true }).click();
  const dates = await page.getByLabel('Target day for added tasks').locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  const originalTasks = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).tasks, STORAGE_KEY);
  const handle = page.getByTestId('picker-row-task-1').getByRole('button', { name: /Drag/ });
  await handle.focus();
  await page.keyboard.press('Space');
  // Activation and the first collision confirm that the overlay and measured
  // droppables are ready; key input itself does not wait for either.
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.planner-drag-preview')).toBeVisible();
  await expect(page.locator('.week-planning-days-grid .day-plan-container.is-over')).toHaveCount(1);
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId(`day-plan-${dates[0]}`)).toHaveClass(/is-over/);
  // Navigate and drop within one browser task, before React can commit `over`.
  // Monday -> Tuesday -> Wednesday -> Tuesday must count every key press.
  await page.evaluate(() => {
    for (const code of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'Space']) {
      const key = code === 'Space' ? ' ' : code;
      document.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true, cancelable: true }));
    }
  });
  await expect(page.getByTestId(`day-plan-${dates[1]}`)).toContainText('Tax invoice review');
  await expect(page.locator('.week-planning-days-grid .planned-entry-card')).toHaveCount(1);
  await expect(handle).not.toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[id^="DndLiveRegion-"]')).toContainText('Tax invoice review added to Tuesday');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.tasks).toEqual(originalTasks);
});

test('mobile sheet traps focus, closes on Escape, and opens a reachable task editor', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
  const opener = page.getByRole('button', { name: 'Add from board', exact: true });
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'Add from board', exact: true });
  await expect(sheet.getByRole('button', { name: 'Close add from board' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await sheet.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();
  await expect(opener).toBeFocused();
  await opener.click();
  await sheet.getByRole('button', { name: 'Tax invoice review', exact: true }).click();
  await expect(sheet).not.toBeVisible();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  await expect(editor).toBeVisible();
  await editor.getByRole('textbox', { name: 'Task name' }).fill('Reachable editor');
  await editor.getByRole('button', { name: 'Save changes' }).click();
});

test('entry refresh updates the draft; details trap focus and restore the opener', async ({ page }) => {
  let board = planTask(testBoard(), 'task-1', mondayOf(brisbaneToday()));
  const id = board.plannedEntries![0].id;
  board = updateEntry(board, id, { title: 'Old planned title', durationMin: 10 });
  await page.evaluate(({ key, board }) => localStorage.setItem(key, JSON.stringify(board)), { key: STORAGE_KEY, board });
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
  const opener = page.getByRole('button', { name: 'Old planned title', exact: true });
  await opener.click();
  const modal = page.getByRole('dialog', { name: 'Planned task details' });
  await expect(modal.getByRole('button', { name: 'Close details' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(modal.getByRole('button', { name: 'Save changes' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await modal.getByRole('button', { name: 'Refresh from task' }).click();
  await expect(modal.getByLabel('Task title')).toHaveValue('Tax invoice review');
  await expect(modal.getByLabel('Duration (minutes)')).toHaveValue('45');
  await modal.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId(`planned-entry-${id}`)).toContainText('Tax invoice review');
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.plannedEntries[0]).toMatchObject({ title: 'Tax invoice review', durationMin: 45 });
});

test('shared removal Undo restores the exact entry and expires after eight seconds', async ({ page }) => {
  let board = planTask(planTask(testBoard(), 'task-1', mondayOf(brisbaneToday())), 'task-2', mondayOf(brisbaneToday()));
  const originalTasks = JSON.parse(JSON.stringify(board.tasks));
  const original = board.plannedEntries![0];
  original.checklist[0].done = true;
  original.notes = 'Keep these independent notes';
  await page.evaluate(({ key, board }) => localStorage.setItem(key, JSON.stringify(board)), { key: STORAGE_KEY, board });
  await page.reload();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
  await page.getByTestId(`planned-entry-${original.id}`).getByRole('button', { name: /Actions for/ }).click();
  const actions = page.getByRole('dialog', { name: /Actions for/ });
  await actions.getByRole('button', { name: /checklist steps completed/ }).click();
  await actions.getByLabel('Check totals', { exact: true }).check();
  original.checklist[1].done = true;
  await actions.getByRole('button', { name: /Remove .* from plan/ }).click();
  const toast = page.getByRole('status').filter({ hasText: 'Removed Tax invoice review.' });
  await expect(toast).toBeVisible();
  await expect(page.getByTestId(`planned-entry-${original.id}`)).toHaveCount(0);
  await page.clock.fastForward(7900);
  await expect(toast).toBeVisible();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /^Today\b/ }).click();
  await toast.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Week planner', exact: true }).click();
  await expect(page.getByTestId(`planned-entry-${original.id}`)).toBeVisible();
  let saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.plannedEntries.find((entry: { id: string }) => entry.id === original.id)).toEqual(original);
  expect(saved.plannedEntries.filter((entry: { date: string }) => entry.date === original.date).map((entry: { order: number }) => entry.order).sort()).toEqual([0, 1]);
  // The details modal uses the same shared removal path.
  await page.getByTestId(`planned-entry-${original.id}`).getByRole('button', { name: 'Tax invoice review', exact: true }).click();
  await page.getByRole('dialog', { name: 'Planned task details' }).getByRole('button', { name: 'Remove from plan', exact: true }).click();
  await expect(toast).toBeVisible();
  await page.clock.fastForward(8100);
  await expect(toast).not.toBeVisible();
  saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.plannedEntries.some((entry: { id: string }) => entry.id === original.id)).toBe(false);
  expect(saved.tasks).toEqual(originalTasks);
});
