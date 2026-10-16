import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('Today uses the task board palette; copies have independent progress', async ({page}) => {
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/^Today\b/}).click();
  await expect(page.getByRole('heading',{name:'Plan today from your task board'})).toBeVisible();
  await page.getByRole('button',{name:/Add Family time to/}).click();
  await page.getByRole('button',{name:/Add Family time to/}).click();
  const entries=page.locator('[data-testid^="plan-entry-"]');
  await expect(entries).toHaveCount(2);
  await entries.first().getByRole('combobox',{name:/Status for planned Family time/}).selectOption('finished');
  await expect(entries.nth(1).getByRole('combobox',{name:/Status for planned Family time/})).toHaveValue('not-started');
  await page.reload();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/^Today\b/}).click();
  await expect(page.locator('[data-testid^="plan-entry-"]')).toHaveCount(2);
});
test('Week planner displays seven days and supports board task drag and touch alternative',async ({page})=>{
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/Week planner/}).click();
  await expect(page.locator('[data-testid^="plan-day-"]')).toHaveCount(7);
  const source=page.locator('.plan-source-card').filter({hasText:'Family time'}).first();
  const targets=page.locator('[data-testid^="plan-day-"]');
  await source.dragTo(targets.nth(1));
  await expect(targets.nth(1).locator('[data-testid^="plan-entry-"]')).toHaveCount(1);
  await targets.nth(2).getByRole('button',{name:/\w/}).first().click();
  await page.getByRole('button',{name:/Add Family time to/}).click();
  await expect(targets.nth(2).locator('[data-testid^="plan-entry-"]')).toHaveCount(1);
});
test('Calendar day opens editable window, and selected days can be copied to another date',async ({page})=>{
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/Calendar/}).click();
  const cells=page.locator('[data-testid^="calendar-date-"]');
  await cells.first().getByRole('button',{name:/View/}).click();
  await expect(page.getByRole('dialog',{name:/Plan/})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:/Add Family time to/}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Close planner'}).click();
  await page.getByRole('button',{name:'Copy / paste days'}).click();
  await expect(page.getByRole('dialog',{name:'Copy and paste multiple calendar days'})).toBeVisible();
});
test('mobile planning surfaces avoid horizontal body overflow at common widths',async ({page})=>{
  for(const width of [320,375,390,768,1024,1440]){
    await page.setViewportSize({width,height:850});
    if(width<800){
      await page.getByRole('button',{name:'Open menu'}).click();
      await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/Week planner/}).click();
    } else {
      await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/Week planner/}).click();
    }
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+3)).toBe(true);
    await expect(page.locator('[data-testid^="plan-day-"]')).toHaveCount(7);
  }
});
