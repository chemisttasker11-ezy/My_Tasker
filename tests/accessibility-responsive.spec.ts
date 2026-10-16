import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.describe('TaskModal accessibility and focus trap (CR-8)', () => {
  test('traps focus, closes on Esc, restores focus to opener, and marks background inert', async ({ page }) => {
    const newTaskBtn = page.getByRole('button', { name: 'New task' });
    await expect(newTaskBtn).toBeVisible();
    await newTaskBtn.click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Opener should have opened the modal and initial focus should be on task name input
    const taskNameInput = page.getByRole('textbox', { name: 'Task name' });
    await expect(taskNameInput).toBeFocused();

    // Background siblings of modal scrim must be marked inert
    const isBackgroundInert = await page.evaluate(() => {
      const scrim = document.querySelector('.modal-scrim');
      const header = document.querySelector('.site-header, .topbar');
      const aside = document.querySelector('.sidebar');
      const main = document.querySelector('.main-shell');
      return Boolean(
        scrim &&
        (header?.hasAttribute('inert') || header?.closest('[inert]') ||
         aside?.hasAttribute('inert') || aside?.closest('[inert]') ||
         main?.hasAttribute('inert') || main?.closest('[inert]'))
      );
    });
    expect(isBackgroundInert).toBe(true);

    // Save button in sticky footer
    const saveButton = page.getByRole('button', { name: 'Create task' });
    await expect(saveButton).toBeVisible();

    // Close button in header
    const closeButton = page.getByRole('button', { name: 'Close editor' });
    await expect(closeButton).toBeVisible();

    // Focus close button, then Shift+Tab should wrap to the last focusable element (Create task)
    await closeButton.focus();
    await expect(closeButton).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(saveButton).toBeFocused();

    // Tab from save button should wrap to the first focusable element (Close editor)
    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();

    // Pressing Esc should dismiss the modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    // Background must no longer be inert
    const hasInertAfterClose = await page.evaluate(() => {
      return document.querySelectorAll('[inert]').length > 0;
    });
    expect(hasInertAfterClose).toBe(false);

    // Focus must return to opener
    await expect(newTaskBtn).toBeFocused();
  });
});

test.describe('Mobile drawer visibility (CR-9)', () => {
  test('closed mobile drawer uses visibility:hidden so buttons are not focusable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toHaveCSS('visibility', 'hidden');

    // Open menu
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(sidebar).toHaveCSS('visibility', 'visible');

    // Close menu
    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(sidebar).toHaveCSS('visibility', 'hidden');
  });
});

test.describe('Mobile header button (DC-7)', () => {
  test('mobile header "New task" button does not wrap at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const newTaskBtn = page.getByRole('button', { name: 'New task' });
    await expect(newTaskBtn).toBeVisible();

    // Ensure white-space is nowrap and button fits on a single line
    await expect(newTaskBtn).toHaveCSS('white-space', 'nowrap');
    const box = await newTaskBtn.boundingBox();
    expect(box).not.toBeNull();
    // Height should remain single line (~38-44px)
    expect(box!.height).toBeLessThanOrEqual(48);
  });
});

test.describe('TaskBoard card keyboard lane move alternative', () => {
  test('card menu provides "Move to lane..." options and closes with Esc', async ({ page }) => {
    await page.getByRole('button', { name: 'My task board' }).click();
    const moreBtn = page.getByRole('button', { name: 'More options for Tax' });
    await moreBtn.click();

    const popover = page.locator('.card-popover');
    await expect(popover).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Weekly' })).toBeVisible();

    // Esc closes menu and returns focus to More button
    await page.keyboard.press('Escape');
    await expect(popover).not.toBeVisible();
    await expect(moreBtn).toBeFocused();
  });
});

test.describe('Responsive horizontal overflow (DC-6 & all views)', () => {
  const viewports = [
    { width: 375, height: 667, name: '375px mobile' },
    { width: 768, height: 1024, name: '768px tablet' },
    { width: 1024, height: 768, name: '1024px desktop' },
  ];

  const views = [
    { id: 'overview', name: 'Overview' },
    { id: 'today', name: 'Today' },
    { id: 'board', name: 'My task board' },
    { id: 'week', name: 'Week planner' },
    { id: 'calendar', name: 'Calendar' },
    { id: 'upcoming', name: 'Upcoming' },
    { id: 'goals', name: 'Long-term goals' },
    { id: 'completed', name: 'Completed' },
    { id: 'quotes', name: 'Direction & quotes' },
    { id: 'library', name: 'Life task library' },
    { id: 'settings', name: 'Settings & backup' },
  ];

  for (const vp of viewports) {
    for (const v of views) {
      test(`no horizontal overflow at ${vp.name} on ${v.name} view`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });

        if (vp.width <= 720) {
          await page.getByRole('button', { name: 'Open menu' }).click();
          await page.getByRole('button', { name: v.name }).click();
        } else {
          await page.getByRole('button', { name: v.name }).click();
        }

        await page.waitForTimeout(100);

        const hasNoOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth <= window.innerWidth + 2;
        });
        expect(hasNoOverflow).toBe(true);
      });
    }
  }

  test(`no horizontal overflow in Settings at 736px with suggestion row wrapping`, async ({ page }) => {
    await page.setViewportSize({ width: 736, height: 800 });
    await page.getByRole('button', { name: 'Settings & backup' }).click();
    await page.waitForTimeout(100);

    const hasNoOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 2;
    });
    expect(hasNoOverflow).toBe(true);

    const suggestionRow = page.locator('.suggestion-row').first();
    await expect(suggestionRow).toBeVisible();
    await expect(suggestionRow).toHaveCSS('flex-wrap', 'wrap');
  });
});
