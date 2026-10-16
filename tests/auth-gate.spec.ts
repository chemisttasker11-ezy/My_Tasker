import { expect, test, type Page } from '@playwright/test';

/** Separate from local-demo acceptance: this tests the real AuthGate entrypoint. */
type Mode='user'|'admin-enrolled'|'admin-first';
async function stubAPI(page:Page,mode:Mode) {
  let logged=false;
  let pending=false;
  let adminReady=false;
  let verifiedEmail=false;
  let cloudRevision=0;
  const person={id:12,email:'tester@example.test'};
  const owner={id:3,email:'owner@example.test',owner:true};
  await page.addInitScript(()=>{
    (window as typeof window & {grecaptcha?:{render:(element:HTMLElement,options:{callback:(token:string)=>void})=>number}}).grecaptcha={
      render(element,options){
        element.textContent='CAPTCHA verified in automated test';
        options.callback('test-only-client-token');
        return 1;
      }
    };
  });
  await page.route('**/api/**',async route=>{
    const request=route.request();
    const url=new URL(request.url());
    const path=url.pathname;
    const body=(()=>{try{return JSON.parse(request.postData()??'{}') as Record<string,unknown>}catch{return {}}})();
    const json=(data:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(path==='/api/auth/me/')return logged?json({user:adminReady?owner:person}):json({detail:'Not authenticated'},401);
    if(path==='/api/config/')return json({captcha_site_key:'test-site-key'});
    if(path==='/api/admin/status/')return json({stage:adminReady?'ready':pending?(mode==='admin-first'?'enroll':'challenge'):'login',user:adminReady?owner:pending?owner:undefined});
    if(path==='/api/auth/csrf/')return json({csrf_token:'test-csrf'});
    if(path==='/api/auth/login/'){
      if(mode==='user'){logged=true;return json({user:person});}
      pending=true;return json({admin_challenge:true,enrolled:mode!=='admin-first'},202);
    }
    if(path==='/api/auth/signup/'){
      if(!body.captcha_token)return json({detail:'CAPTCHA required'},400);
      if(body.email==='existing@example.test')return json({detail:'This email already has an account.'},409);
      return json({detail:'Check your inbox for the six-digit code.'},201);
    }
    if(path==='/api/auth/verify-otp/'){verifiedEmail=true;return json({detail:'Email verified.'});}
    if(path==='/api/auth/resend-otp/')return json({detail:'Verification code resent.'});
    if(path==='/api/auth/logout/'){logged=false;pending=false;adminReady=false;return json({detail:'Signed out.'});}
    if(path==='/api/board/'&&request.method()==='GET')return json({board:null,revision:cloudRevision});
    if(path==='/api/board/'&&request.method()==='PUT'){cloudRevision++;return json({revision:cloudRevision});}
    if(path==='/api/admin/enroll/')return json({qr:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5rxXwAAAAASUVORK5CYII=',secret:'JBSWY3DPEHPK3PXP',uri:'otpauth://totp/MyTasker',expires_in_seconds:600});
    if(path==='/api/admin/verify/'){if(!pending)return json({detail:'Password required'},401);adminReady=true;logged=true;return json({user:owner,...(mode==='admin-first'?{backup_codes:['ABCD1234-9876ABCD','AAAA1234-ABCDE123']}: {})});}
    if(path==='/api/admin/overview/')return json({users:{total:22,active:19,pending_verification:3,new_last_7_days:5,admins:2,saved_boards:14},activity:[],permissions:{can_manage_users:true}});
    if(path==='/api/admin/users/')return json({page:1,total:1,per_page:20,users:[{id:12,email:'tester@example.test',active:true,staff:false,owner:false,joined:'2026-10-16T00:00:00Z',last_login:null,verified_mfa:false,email_verified:true}]});
    if(path==='/api/admin/audit/')return json({page:1,total:0,per_page:25,events:[]});
    if(path==='/api/admin/health/')return json({smtp_configured:true,captcha_configured:true,authenticator_required:true,session_window_hours:12,https_required:true,environment:'production',board_storage:'PostgreSQL'});
    if(path==='/api/admin/users/12/sessions/')return json({detail:'Revoked'});
    if(path==='/api/admin/users/12/status/')return json({user:{}});
    if(path==='/api/admin/users/12/staff/')return json({user:{}});
    return json({detail:'Mock endpoint not defined: '+path},404);
  });
  return {isVerified:()=>verifiedEmail};
}
test.describe('@auth-gate authenticated app acceptance',()=>{
  test('sign up with CAPTCHA and email code then log in to a private planner',async({page})=>{
    const mock=await stubAPI(page,'user');
    await page.goto('/');
    await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
    await page.getByRole('button',{name:/Sign up/}).click();
    await expect(page.getByRole('heading',{name:'Create your account'})).toBeVisible();
    await page.getByRole('textbox',{name:'Email address'}).fill('tester@example.test');
    await page.getByLabel('Password (12+ characters)').fill('ExampleSecurePassword#2026');
    await page.getByLabel('Confirm password').fill('ExampleSecurePassword#2026');
    await page.getByRole('button',{name:/Create account/}).click();
    await expect(page.getByRole('heading',{name:'Check your inbox'})).toBeVisible();
    await page.getByRole('textbox',{name:'Six-digit email code'}).fill('123456');
    await page.getByRole('button',{name:'Verify email'}).click();
    await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
    expect(mock.isVerified()).toBe(true);
    await page.getByRole('textbox',{name:'Email address'}).fill('tester@example.test');
    await page.getByLabel('Password',{exact:true}).fill('ExampleSecurePassword#2026');
    await page.getByRole('button',{name:'Log in'}).click();
    await expect(page.getByRole('heading',{name:'Make this week yours.'})).toBeVisible();
    await page.getByRole('button',{name:'Open week planner'}).click();
    await expect(page.getByRole('heading',{name:'Plan your week'})).toBeVisible();
  });
  test('unverified signup can resume after closing the page without recreating the account',async({page})=>{
    await stubAPI(page,'user');
    await page.goto('/');
    await page.getByRole('button',{name:'Verify email / resend code'}).click();
    await expect(page.getByRole('heading',{name:'Check your inbox'})).toBeVisible();
    await page.getByRole('textbox',{name:'Email address'}).fill('existing@example.test');
    await page.getByRole('button',{name:'Resend code'}).click();
    await expect(page.getByRole('status')).toContainText('Verification code resent.');
    await page.getByRole('textbox',{name:'Six-digit email code'}).fill('654321');
    await page.getByRole('button',{name:'Verify email'}).click();
    await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  });
  test('duplicate signup offers a safe existing-account verification path',async({page})=>{
    await stubAPI(page,'user');
    await page.goto('/');
    await page.getByRole('button',{name:/Sign up/}).click();
    await page.getByRole('textbox',{name:'Email address'}).fill('existing@example.test');
    await page.getByLabel('Password (12+ characters)').fill('AnotherExampleSecure#2026');
    await page.getByLabel('Confirm password').fill('AnotherExampleSecure#2026');
    await page.getByRole('button',{name:/Create account/}).click();
    await expect(page.getByText(/If this is your account, use Log in/)).toBeVisible();
    await page.getByRole('button',{name:'Verify email / resend code'}).click();
    await expect(page.getByRole('textbox',{name:'Email address'})).toHaveValue('existing@example.test');
    await expect(page.getByRole('button',{name:'Resend code'})).toBeEnabled();
  });
  test('administrator password requires authenticator before dashboard access',async({page})=>{
    await stubAPI(page,'admin-enrolled');
    await page.goto('/');
    await page.getByRole('textbox',{name:'Email address'}).fill('owner@example.test');
    await page.getByLabel('Password',{exact:true}).fill('HighlySecureAdmin#2026');
    await page.getByRole('button',{name:'Log in'}).click();
    await expect(page.getByRole('heading',{name:'Enter your authenticator code'})).toBeVisible();
    await page.getByRole('textbox',{name:'Authenticator verification code'}).fill('123456');
    await page.getByRole('button',{name:'Verify and continue'}).click();
    await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
    await expect(page.getByText('MFA verified')).toBeVisible();
    await page.getByRole('navigation',{name:'Administration'}).getByRole('button',{name:'Users'}).click();
    await expect(page.getByRole('heading',{name:'User accounts'})).toBeVisible();
    await expect(page.getByText('tester@example.test')).toBeVisible();
    await page.getByRole('button',{name:'My planner'}).click();
    await expect(page.getByRole('heading',{name:'Make this week yours.'})).toBeVisible();
    await page.getByRole('button',{name:'Open week planner'}).click();
    await expect(page.getByRole('heading',{name:'Plan your week'})).toBeVisible();
    await page.getByRole('button',{name:'Return to secured admin'}).click();
    await expect(page.getByRole('navigation',{name:'Administration'})).toBeVisible();
  });
  test('first-time admin must save recovery codes before access',async({page})=>{
    await stubAPI(page,'admin-first');
    await page.goto('/');
    await page.getByRole('textbox',{name:'Email address'}).fill('owner@example.test');
    await page.getByLabel('Password',{exact:true}).fill('HighlySecureAdmin#2026');
    await page.getByRole('button',{name:'Log in'}).click();
    await expect(page.getByRole('heading',{name:'Set up your authenticator'})).toBeVisible();
    await page.getByRole('button',{name:'Generate authenticator setup'}).click();
    await expect(page.getByRole('img',{name:/Scan this QR/})).toBeVisible();
    await page.getByRole('textbox',{name:'Authenticator verification code'}).fill('123456');
    await page.getByRole('button',{name:'Verify and continue'}).click();
    await expect(page.getByRole('heading',{name:'Store your recovery codes'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Open admin dashboard'})).toBeDisabled();
    await page.getByRole('checkbox',{name:"I've securely saved these codes."}).check();
    await page.getByRole('button',{name:'Open admin dashboard'}).click();
    await expect(page.getByRole('navigation',{name:'Administration'})).toBeVisible();
  });
  test('signup and admin dashboard do not overflow at mobile widths',async({page})=>{
    await stubAPI(page,'admin-enrolled');
    for(const width of [320,375,390,768]){
      await page.setViewportSize({width,height:850});
      await page.goto('/');
      await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
    }
    await page.getByRole('textbox',{name:'Email address'}).fill('owner@example.test');
    await page.getByLabel('Password',{exact:true}).fill('HighlySecureAdmin#2026');
    await page.getByRole('button',{name:'Log in'}).click();
    await page.getByRole('textbox',{name:'Authenticator verification code'}).fill('123456');
    await page.getByRole('button',{name:'Verify and continue'}).click();
    for(const width of [320,375,390,768,1440]){
      await page.setViewportSize({width,height:850});
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
      if(width===390)await page.screenshot({path:'test-results/admin-dashboard-mobile.png',fullPage:true});
      if(width===1440)await page.screenshot({path:'test-results/admin-dashboard-desktop.png',fullPage:true});
    }
  });
});
