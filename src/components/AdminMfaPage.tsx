import { useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import * as admin from '../lib/adminApi';

export function AdminMfaPage({stage,onAuthenticated,onBack}:{
  stage:'challenge'|'enroll';
  onAuthenticated:(response:admin.AdminVerified)=>Promise<void>;
  onBack:()=>Promise<void>;
}) {
  const [setup,setSetup]=useState<{qr:string;secret:string}|null>(null);
  const [code,setCode]=useState('');
  const [backup,setBackup]=useState<string[]|null>(null);
  const [savedBackup,setSavedBackup]=useState(false);
  const [pendingResult,setPendingResult]=useState<admin.AdminVerified|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function begin(){
    setBusy(true);setError('');
    try{setSetup(await admin.enroll());}
    catch(e){setError(e instanceof Error?e.message:'Could not start authenticator setup.');}
    finally{setBusy(false)}
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');
    try{
      const result=await admin.verify(code.trim().toUpperCase());
      if(result.backup_codes?.length){
        setPendingResult(result);setBackup(result.backup_codes);
      }else await onAuthenticated(result);
    }catch(e){setError(e instanceof Error?e.message:'Authenticator code invalid or expired.');}
    finally{setBusy(false)}
  }
  return <div className="auth-shell admin-mfa-shell">
    <aside className="auth-story">
      <div className="auth-brand"><span className="auth-brand-mark"><ShieldCheck size={25}/></span><strong>my<span>tasker</span></strong></div>
      <div className="auth-story-copy"><span className="auth-eyebrow"><LockKeyhole size={16}/> PROTECTED ADMIN AREA</span>
        <h1>Your account.<br/><em>Double secured.</em></h1>
        <p>Every administrator signs in with a password plus a six-digit code from an authenticator app. No email or SMS substitutes.</p>
      </div>
    </aside>
    <main className="auth-form-wrap">
      <div className="auth-form-inner">
        <span className="auth-form-top"><ShieldCheck size={18}/> Administrator verification</span>
        {backup&&pendingResult?<>
          <h2>Store your recovery codes</h2>
          <p className="auth-help">Each backup code works only once. Store them offline in a trusted password manager before entering your dashboard.</p>
          <div className="admin-backup-list" aria-label="Single-use recovery codes">{backup.map(code=><code key={code}>{code}</code>)}</div>
          <button type="button" className="button button-secondary" onClick={()=>{
            const blob=new Blob([backup.join('\n')+'\n'],{type:'text/plain'});
            const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='my-tasker-backup-codes.txt';a.click();URL.revokeObjectURL(url);
          }}>Save backup codes</button>
          <label className="admin-acknowledge"><input type="checkbox" checked={savedBackup} onChange={event=>setSavedBackup(event.target.checked)}/> I've securely saved these codes.</label>
          <button type="button" className="auth-primary" disabled={!savedBackup||busy} onClick={()=>void onAuthenticated(pendingResult)}>Open admin dashboard</button>
        </>:<>
          <h2>{stage==='enroll'?'Set up your authenticator':'Enter your authenticator code'}</h2>
          <p className="auth-help">{stage==='enroll'?'Scan the QR code in Google Authenticator, Microsoft Authenticator, 1Password or another TOTP app.':'Open your authenticator app and enter the current six-digit code. A saved single-use recovery code also works.'}</p>
          {error&&<p className="auth-alert" role="alert">{error}</p>}
          {stage==='enroll'&&!setup&&<button type="button" className="auth-primary" disabled={busy} onClick={()=>void begin()}>{busy?'Preparing…':'Generate authenticator setup'}</button>}
          {stage==='enroll'&&setup&&<div className="admin-mfa-qr"><img src={setup.qr} alt="Scan this QR with your authenticator application" width={220} height={220}/><p>If scanning is unavailable, enter this setup key manually:</p><code>{setup.secret}</code><p>Setup expires after 10 minutes. Never share this key.</p></div>}
          {(stage==='challenge'||setup)&&<form className="auth-form" onSubmit={e=>void submit(e)}>
            <label>{stage==='enroll'?'Authenticator verification code':'Authenticator or recovery code'}
              <span className="auth-input-icon"><KeyRound size={18}/><input autoComplete="one-time-code" required maxLength={60} value={code}
                onChange={e=>setCode(e.target.value)} inputMode="text" placeholder="6 digits" aria-label="Authenticator verification code"/></span>
            </label>
            <button className="auth-primary" type="submit" disabled={busy||!code.trim()}>{busy?'Verifying…':'Verify and continue'} <CheckCircle2 size={18}/></button>
          </form>}
          <button className="auth-secondary-link" type="button" onClick={()=>void onBack()}><ArrowLeft size={16}/> Back to login</button>
        </>}
      </div>
    </main>
  </div>;
}
