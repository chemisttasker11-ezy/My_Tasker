import { test, expect, type Browser, type Page } from '@playwright/test';

/** @real-server: this suite does NOT mock HTTP. The CI job runs Django against
 * isolated PostgreSQL and Vite serves the actual React auth/planner.
 */
const password='IntegrationOnlyPassword#2026';
async function signIn(browser:Browser,email:string):Promise<{page:Page;close:()=>Promise<void>}>{
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  await page.getByRole('textbox',{name:'Email address'}).fill(email);
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Log in'}).click();
  await expect(page.getByRole('heading',{name:'Make this week yours.'})).toBeVisible();
  await page.getByRole('button',{name:'Open week planner'}).click();
  await expect(page.getByRole('heading',{name:'Plan your week'})).toBeVisible();
  return {page,close:()=>context.close()};
}
async function data(page:Page){
  const response=await page.request.get('/api/board/');
  expect(response.status()).toBe(200);
  return response.json() as Promise<{board:{tasks:{title:string}[]} | null;revision:number}>;
}
async function create(page:Page,title:string){
  await page.getByRole('button',{name:'New task'}).click();
  await page.getByRole('textbox',{name:'Task name'}).fill(title);
  await page.getByRole('button',{name:'Create task'}).click();
  await expect(page.getByRole('status').filter({hasText:'Task saved'})).toBeVisible();
}
test.describe('@auth-gate @real-server React Django PostgreSQL',()=>{
  test('persists tasks across sessions and prevents another user seeing the board',async({browser})=>{
    test.setTimeout(120000);
    const a=await signIn(browser,'alice@ci.mytasker.test');
    await create(a.page,'Alice private deep work');
    await expect.poll(async()=> (await data(a.page)).board?.tasks.some(t=>t.title==='Alice private deep work'),{timeout:25000}).toBe(true);
    await a.close();
    const reopening=await signIn(browser,'alice@ci.mytasker.test');
    await reopening.page.getByRole('button',{name:'My task board'}).click();
    await expect(reopening.page.getByRole('button',{name:'Alice private deep work',exact:true})).toBeVisible();
    const b=await signIn(browser,'bob@ci.mytasker.test');
    const isolated=await data(b.page);
    expect(isolated.board?.tasks.some(t=>t.title==='Alice private deep work')).toBeFalsy();
    await create(b.page,'Bob private study');
    await expect.poll(async()=> (await data(b.page)).board?.tasks.some(t=>t.title==='Bob private study'),{timeout:25000}).toBe(true);
    const aData=await data(reopening.page);
    expect(aData.board?.tasks.some(t=>t.title==='Bob private study')).toBeFalsy();
    await Promise.all([reopening.close(),b.close()]);
  });
  test('stale session warns, blocks silent overwrites and offers local backup',async({browser})=>{
    test.setTimeout(120000);
    const a=await signIn(browser,'alice@ci.mytasker.test');
    await expect.poll(async()=> (await data(a.page)).revision,{timeout:25000}).toBeGreaterThan(0);
    const b=await signIn(browser,'alice@ci.mytasker.test');
    const before=await data(b.page);
    await create(a.page,'Alice latest concurrent change');
    await expect.poll(async()=> (await data(a.page)).revision,{timeout:25000}).toBeGreaterThan(before.revision);
    await create(b.page,'Bob stale local draft');
    await expect(b.page.getByRole('alert').filter({hasText:'Changes not synced.'})).toBeVisible({timeout:25000});
    const after=await data(a.page);
    expect(after.board?.tasks.some(t=>t.title==='Alice latest concurrent change')).toBe(true);
    expect(after.board?.tasks.some(t=>t.title==='Bob stale local draft')).toBe(false);
    const download=b.page.waitForEvent('download');
    await b.page.getByRole('button',{name:'Download local backup'}).click();
    const backup=await download;
    expect(backup.suggestedFilename()).toContain('.json');
    await b.page.getByRole('button',{name:'Retry cloud sync'}).click();
    await expect(b.page.getByRole('alert')).toContainText('Another device saved newer changes');
    await Promise.all([a.close(),b.close()]);
  });
});
