import { test, expect } from '@playwright/test';

test.beforeEach(async ({page})=>{
  await page.goto('/');
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/^Today\\b/}).click();
});

test('PR3 Today provides Now/timeline and a one-field quick capture',async({page})=>{
  await expect(page.getByRole('heading',{name:'Now and next'})).toBeVisible();
  await page.getByRole('textbox',{name:'Quick add task'}).fill('Call supplier tomorrow!');
  await page.locator('.quick-add-form').getByRole('button',{name:'Add task'}).click();
  await expect(page.getByText('Added: Call supplier')).toBeVisible();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/My task board/}).click();
  await expect(page.getByText('Call supplier',{exact:true}).first()).toBeVisible();
});

test('PR3 focus mode opens one task and exits without losing the Today view',async({page})=>{
  await page.getByRole('button',{name:/Start focus mode for Family time/}).first().click();
  const dialog=page.getByRole('dialog',{name:'Focus mode'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading',{name:'Family time'})).toBeVisible();
  await dialog.getByRole('button',{name:'Exit focus mode'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Now and next'})).toBeVisible();
});
