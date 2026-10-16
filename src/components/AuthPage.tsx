import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, Sparkles, Target, Zap } from 'lucide-react';
import * as api from '../lib/authApi';

type Page = 'login' | 'signup' | 'verify' | 'forgot' | 'reset';
interface CaptchaAPI {
  render: (element: HTMLElement, settings: {sitekey:string;callback:(token:string)=>void;'expired-callback':()=>void})=>number;
}
declare global { interface Window { grecaptcha?: CaptchaAPI } }

export function AuthPage({ onAuthenticated, captchaKey }: {onAuthenticated:(result:api.LoginResult)=>Promise<void>;captchaKey:string}) {
  const [page,setPage]=useState<Page>('login');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [otp,setOtp]=useState('');
  const [captcha,setCaptcha]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const captchaNode=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(page!=='signup'||!captchaKey)return;
    let cancelled=false;
    const render=()=>{
      if(cancelled||!captchaNode.current||!window.grecaptcha)return;
      if(captchaNode.current.childElementCount)return;
      window.grecaptcha.render(captchaNode.current,{sitekey:captchaKey,callback:token=>setCaptcha(token),'expired-callback':()=>setCaptcha('')});
    };
    if(window.grecaptcha) { render();return()=>{cancelled=true}; }
    const script=document.createElement('script');
    script.src='https://www.google.com/recaptcha/api.js?render=explicit';
    script.async=true;script.defer=true;script.addEventListener('load',render);
    document.head.append(script);
    return()=>{cancelled=true;script.removeEventListener('load',render)};
  },[page,captchaKey]);
  function go(next:Page){setError('');setMessage('');setPassword('');setConfirm('');setOtp('');setCaptcha('');setPage(next)}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try {
      if(page==='login') await onAuthenticated(await api.login(email,password));
      else if(page==='signup'){
        if(password!==confirm)throw Error('Passwords do not match.');
        if(!captcha)throw Error('Complete the CAPTCHA to continue.');
        try {
          await api.signup(email,password,captcha);
          go('verify');
          setMessage('We sent a six-digit code to your inbox. It expires in 10 minutes.');
        } catch (failure) {
          if(failure instanceof api.ApiError && failure.status === 409) {
            setMessage('If this is your account, use Log in. If you still need to verify your email, choose Verify email below; a new code can be requested.');
          } else throw failure;
        }
      }else if(page==='verify'){
        await api.verifyOtp(email,otp);go('login');setMessage('Email verified. You can now log in.');
      }else if(page==='forgot'){
        await api.requestReset(email);go('reset');setMessage('If this email has an account, we sent a recovery code.');
      }else if(page==='reset'){
        if(password!==confirm)throw Error('Passwords do not match.');
        await api.resetPassword(email,otp,password);go('login');setMessage('Password updated. Log in with the new password.');
      }
    }catch(err){setError(err instanceof Error?err.message:'Something went wrong. Please retry.')}
    finally{setBusy(false)}
  }
  const isVerify=page==='verify'||page==='reset';
  return <div className="auth-shell">
    <section className="auth-story">
      <div className="auth-brand"><span className="auth-brand-mark"><CheckCircle2 size={25}/></span><strong>my<span>tasker</span></strong></div>
      <div className="auth-story-copy">
        <span className="auth-eyebrow"><Zap size={16}/> MAKE ROOM FOR LIFE</span>
        <h1>Big plans.<br/><em>Bold energy.</em><br/>Your way.</h1>
        <p>Build your week from tasks you already have. Track the progress that matters, and make time for everything else.</p>
        <div className="auth-pill-row"><span><Target size={16}/> Plan with purpose</span><span><Sparkles size={16}/> Keep momentum</span><span><ShieldCheck size={16}/> Your own private space</span></div>
      </div>
      <div className="auth-progress-preview" aria-label="Sample planning flow">
        <div><strong>MON</strong><span className="auth-color-blue">Focus time</span><span className="auth-color-green">Movement</span></div>
        <div><strong>TUE</strong><span className="auth-color-orange">Weekly goals</span><span className="auth-color-blue">Learn</span></div>
        <div><strong>WED</strong><span className="auth-color-yellow">Recharge</span><span className="auth-color-green">Family</span></div>
      </div>
    </section>
    <main className="auth-form-wrap">
      <div className="auth-form-inner">
        <span className="auth-form-top"><LockKeyhole size={18}/> Your personal workspace</span>
        <h2>{page==='login'?'Welcome back':page==='signup'?'Create your account':page==='verify'?'Check your inbox':page==='forgot'?'Reset your password':'Choose a new password'}</h2>
        <p className="auth-help">{page==='login'?'Good things happen when you show up for yourself.':
          page==='signup'?'Email, password, CAPTCHA, then one email code. No phone verification.':
          page==='verify'?'Enter the six-digit code sent to your email.':
          page==='forgot'?'We will send a time-limited code if your account exists.':
          'Enter the recovery code and your new password.'}</p>
        {error&&<p className="auth-alert" role="alert">{error}</p>}
        {message&&<p className="auth-notice" role="status">{message}</p>}
        <form className="auth-form" onSubmit={e=>void submit(e)}>
          <label>Email address <span className="auth-input-icon"><Mail size={17}/><input type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></span></label>
          {isVerify&&<label>Six-digit email code <span className="auth-input-icon"><KeyRound size={17}/><input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" placeholder="123456" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))}/></span></label>}
          {page!=='verify'&&page!=='forgot'&&<label>{page==='login'?'Password':'Password (12+ characters)'} <span className="auth-input-icon"><LockKeyhole size={17}/><input type={showPassword?'text':'password'} autoComplete={page==='login'?'current-password':'new-password'} required minLength={page==='login'?1:12} maxLength={200} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword(s=>!s)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>}
          {(page==='signup'||page==='reset')&&<label>Confirm password <input type="password" autoComplete="new-password" required minLength={12} maxLength={200} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
          {page==='signup'&&<div className="auth-captcha">{captchaKey?<div ref={captchaNode} aria-label="CAPTCHA verification"/>:<p role="alert">Signup is not configured yet. Ask the site owner to add reCAPTCHA keys.</p>}</div>}
          <button className="auth-primary" type="submit" disabled={busy || (page==='signup'&&(!captchaKey||!captcha))}>{busy?'Working…':page==='login'?'Log in':page==='signup'?'Create account':page==='verify'?'Verify email':page==='forgot'?'Send recovery code':'Update password'} <ArrowRight size={19}/></button>
        </form>
        <div className="auth-links">
          {page==='login'&&<><button type="button" onClick={()=>go('signup')}>New here? <strong>Sign up</strong></button><button type="button" onClick={()=>go('verify')}>Verify email / resend code</button><button type="button" onClick={()=>go('forgot')}>Forgot password?</button></>}
          {page==='signup'&&<><button type="button" onClick={()=>go('login')}>Already have an account? <strong>Log in</strong></button><button type="button" onClick={()=>go('verify')}>Verify email / resend code</button></>}
          {page==='verify'&&<><button disabled={busy||!/^\S+@\S+\.\S+$/.test(email)} type="button" onClick={()=>{setBusy(true);setError('');setMessage('');void api.resendOtp(email).then(x=>setMessage(x.detail)).catch(err=>setError(err instanceof Error?err.message:'Please retry')).finally(()=>setBusy(false))}}>Resend code</button><button type="button" onClick={()=>go('login')}>Back to login</button></>}
          {(page==='forgot'||page==='reset')&&<button type="button" onClick={()=>go('login')}>Back to login</button>}
        </div>
        <div className="auth-quick-guide"><h3>How it works</h3><div><span>1. Build your task board</span><span>2. Drag copies into your week</span><span>3. Set your daily top three</span><span>4. Track wins and review</span></div><p>Your planner syncs to your account across devices. Avoid storing identifiable patient information.</p></div>
      </div>
    </main>
  </div>;
}
