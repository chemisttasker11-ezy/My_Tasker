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
    const bSaveResponses:number[]=[];
    b.page.on('response',response=>{
      if(new URL(response.url()).pathname==='/api/board/' && response.request().method()==='PUT')
        bSaveResponses.push(response.status());
    });
    // Mounting with an existing server board must not silently save an identical
    // board or increment the revision. A server revision represents a user edit.
    await b.page.waitForTimeout(1300);
    expect((await data(b.page)).revision).toBe(before.revision);
    await create(a.page,'Alice latest concurrent change');
    await expect.poll(async()=> (await data(a.page)).revision,{timeout:25000}).toBeGreaterThan(before.revision);
    await create(b.page,'Bob stale local draft');
    // Assert actual backend optimistic-lock rejection, not only a visual banner.
    await expect.poll(()=>bSaveResponses.length,{timeout:25000}).toBeGreaterThan(0);
    expect(bSaveResponses).toContain(409);
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

  test('crash recovery keeps an unsent edit and saves it through the actual PostgreSQL API after consent',async({browser})=>{
    test.setTimeout(120000);
    const session=await signIn(browser,'bob@ci.mytasker.test');
    const title='Recovered from failed PostgreSQL save';
    const revision=(await data(session.page)).revision;
    await session.page.route('**/api/board/',async route=>{
      if(route.request().method()==='PUT')return route.fulfill({
        status:503,contentType:'application/json',body:JSON.stringify({detail:'Network failed during save'})
      });
      await route.continue();
    });
    await create(session.page,title);
    await expect(session.page.getByRole('alert').filter({hasText:'Changes not synced.'})).toBeVisible({timeout:25000});
    expect((await data(session.page)).revision).toBe(revision);
    await session.page.unroute('**/api/board/');
    await session.page.reload();
    const prompt=session.page.getByRole('dialog',{name:'Your progress is still here.'});
    await expect(prompt).toBeVisible({timeout:15000});
    await expect(prompt.getByRole('button',{name:'Restore edits'})).toBeEnabled();
    await prompt.getByRole('button',{name:'Restore edits'}).click();
    await expect.poll(async()=> (await data(session.page)).board?.tasks.some(t=>t.title===title),{timeout:25000}).toBe(true);
    await expect.poll(()=> session.page.evaluate(()=>
      Object.keys(localStorage).filter(key=>key.startsWith('mytasker:unsynced:v1:')).length),{timeout:25000}).toBe(0);
    await session.page.reload();
    await expect(session.page.getByRole('dialog',{name:'Your progress is still here.'})).not.toBeVisible();
    await session.close();
  });

});
