import { test, expect, type Page } from '@playwright/test';
import { sampleBoard } from '../src/lib/sampleBoard';
import type { BoardState } from '../src/model';

interface MockAccountState {
  loggedIn: boolean;
  userId: number;
  serverBoard: BoardState;
  revision: number;
  failWrites: boolean;
  putAttempts: number;
  advanceServer: () => void;
}
/** A page reload simulates a browser crash; mock server state survives it. */
async function serveAccount(page: Page): Promise<MockAccountState> {
  const server: MockAccountState = {
    loggedIn:false, userId:12, serverBoard:sampleBoard(), revision:0,
    failWrites:false, putAttempts:0, advanceServer(){this.revision++;}
  };
  await page.route('**/api/**',async route=>{
    const request=route.request();
    const path=new URL(request.url()).pathname;
    const body=(()=>{try{return JSON.parse(request.postData() ?? '{}') as Record<string,unknown>}catch{return {}}})();
    const reply=(data:unknown,status=200)=>route.fulfill({
      status,contentType:'application/json',body:JSON.stringify(data)
    });
    if(path==='/api/auth/me/')return server.loggedIn?reply({user:{id:server.userId,email:'tester@example.test'}}):reply({detail:'Not authenticated'},401);
    if(path==='/api/config/')return reply({captcha_site_key:''});
    if(path==='/api/admin/status/')return reply({stage:'login'});
    if(path==='/api/auth/csrf/')return reply({csrf_token:'test-only-csrf'});
    if(path==='/api/auth/login/'){server.loggedIn=true;return reply({user:{id:server.userId,email:'tester@example.test'}});}
    if(path==='/api/auth/logout/'){server.loggedIn=false;return reply({detail:'Signed out'});}
    if(path==='/api/board/'&&request.method()==='GET')return reply({board:server.serverBoard,revision:server.revision});
    if(path==='/api/board/'&&request.method()==='PUT'){
      server.putAttempts++;
      if(server.failWrites)return reply({detail:'Connection interrupted; could not save'},503);
      if(body.revision!==server.revision)return reply({detail:'Another session changed this board'},409);
      server.serverBoard=body.board as BoardState;
      server.revision++;
      return reply({revision:server.revision});
    }
    return reply({detail:'Undefined test endpoint '+path},404);
  });
  return server;
}
async function login(page:Page) {
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  await page.getByRole('textbox',{name:'Email address'}).fill('tester@example.test');
  await page.getByLabel('Password',{exact:true}).fill('TestPassword#2026');
  await page.getByRole('button',{name:'Log in'}).click();
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
  const firstGuide=page.getByRole('dialog',{name:'Make this week yours.'});
  if(await firstGuide.isVisible())await firstGuide.getByRole('button',{name:'Close getting started guide'}).click();
}
async function draftRecords(page:Page,userId=12){
  return page.evaluate(id=>Object.keys(localStorage)
    .filter(key=>key.startsWith(`mytasker:unsynced:v1:${id}:`))
    .map(key=>JSON.parse(localStorage.getItem(key) ?? 'null') as {board:{tasks:{title:string}[]};baseRevision:number})
  ,userId);
}
test.describe('@auth-gate durable signed-in crash recovery',()=>{
  test('failed cloud save survives a reload; user chooses restoration and server acknowledges exactly once',async({page})=>{
    const server=await serveAccount(page);
    await page.goto('/');
    await login(page);
    server.failWrites=true;
    await page.getByRole('button',{name:'New task'}).click();
    await page.getByRole('textbox',{name:'Task name'}).fill('Recovered after unexpected browser close');
    await page.getByRole('button',{name:'Create task'}).click();
    await expect.poll(async()=>(await draftRecords(page)).some(r=>r.board.tasks.some(t=>t.title==='Recovered after unexpected browser close'))).toBe(true);
    await expect(page.getByRole('alert').filter({hasText:'Changes not synced.'})).toBeVisible({timeout:15000});
    expect(server.revision).toBe(0);
    server.failWrites=false;
    await page.reload();
    const recovery=page.getByRole('dialog',{name:'Your progress is still here.'});
    await expect(recovery).toBeVisible();
    await expect(recovery.getByText(/The online revision is unchanged/)).toBeVisible();
    await recovery.getByRole('button',{name:'Restore edits'}).click();
    await expect(recovery).not.toBeVisible();
    await expect.poll(()=>server.serverBoard.tasks.some(task=>task.title==='Recovered after unexpected browser close'),{timeout:15000}).toBe(true);
    await expect.poll(async()=>(await draftRecords(page)).length,{timeout:15000}).toBe(0);
    await page.reload();
    await expect(page.getByRole('dialog',{name:'Your progress is still here.'})).not.toBeVisible();
    await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'My task board'}).click();
    await expect(page.getByRole('button',{name:'Recovered after unexpected browser close',exact:true})).toBeVisible();
  });

  test('newer server revision blocks automatic recovery, preserves export and does not overwrite remote work',async({page})=>{
    const server=await serveAccount(page);
    await page.goto('/');
    await login(page);
    server.failWrites=true;
    await page.getByRole('button',{name:'Toggle light or dark theme'}).click();
    await expect.poll(async()=>(await draftRecords(page)).length).toBe(1);
    await expect(page.getByRole('alert').filter({hasText:'Changes not synced.'})).toBeVisible({timeout:15000});
    server.failWrites=false;
    server.advanceServer();
    await page.reload();
    const recovery=page.getByRole('dialog',{name:'Your progress is still here.'});
    await expect(recovery).toBeVisible();
    await expect(recovery.getByText(/A newer online version exists/)).toBeVisible();
    await expect(recovery.getByRole('button',{name:'Restore edits'})).toBeDisabled();
    const downloads=page.waitForEvent('download');
    await recovery.getByRole('button',{name:'Download draft'}).click();
    expect((await downloads).suggestedFilename()).toContain('unsynced');
    const existingRevision=server.revision, existingTheme=server.serverBoard.theme;
    await recovery.getByRole('button',{name:/Continue with online plan/}).click();
    await expect(recovery).not.toBeVisible();
    await page.waitForTimeout(1000);
    expect(server.revision).toBe(existingRevision);
    expect(server.serverBoard.theme).toBe(existingTheme);
    expect((await draftRecords(page)).length).toBeGreaterThan(0);
  });

  test('draft saved under user A cannot appear in user B recovery surface on the same browser',async({page})=>{
    const server=await serveAccount(page);
    await page.goto('/');
    await login(page);
    server.failWrites=true;
    await page.getByRole('button',{name:'Toggle light or dark theme'}).click();
    await expect.poll(async()=>(await draftRecords(page,12)).length).toBe(1);
    server.userId=13;
    server.loggedIn=false;
    server.failWrites=false;
    await page.reload();
    await login(page);
    await expect(page.getByRole('dialog',{name:'Your progress is still here.'})).not.toBeVisible();
    expect((await draftRecords(page,12)).length).toBe(1);
    expect((await draftRecords(page,13)).length).toBe(0);
  });
});
