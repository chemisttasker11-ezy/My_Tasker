import { useState, type FormEvent } from 'react';
import { Cloud, CircleHelp, DownloadCloud, LogOut, Trash2, ShieldCheck } from 'lucide-react';
import { deleteAccount, type SignedInUser } from '../lib/authApi';

export function AccountSettings({ account, signOut, showGuide, importLocal }: {
  account: SignedInUser; signOut:()=>Promise<void>; showGuide:()=>void; importLocal:()=>void;
}) {
  const [deleting,setDeleting]=useState(false);
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function remove(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!window.confirm('Permanently delete your My Tasker account, its task board, plans and history? This cannot be undone.')) return;
    setBusy(true);setError('');
    try { await deleteAccount(password); window.location.reload(); }
    catch(err){setError(err instanceof Error?err.message:'Unable to delete account.');setBusy(false)}
  }
  return <section className="account-card panel" aria-label="My Tasker account">
    <div className="account-heading"><ShieldCheck size={27}/><div><h2>Your private account</h2><p>Signed in as <strong>{account.email}</strong>. Your data is stored separately from other accounts.</p></div></div>
    <div className="account-actions">
      <button className="button button-primary" onClick={showGuide}><CircleHelp size={17}/> Getting started</button>
      <button className="button button-secondary" onClick={importLocal}><DownloadCloud size={17}/> Import tasks saved in this browser</button>
      <button className="button button-secondary" onClick={()=>void signOut()}><LogOut size={17}/> Save & sign out</button>
    </div>
    <p className="account-security-note"><Cloud size={16}/> Changes sync automatically while connected. Export a backup regularly, and never store identifiable patient records.</p>
    <div className="account-danger">
      <button type="button" className="text-link" onClick={()=>setDeleting(x=>!x)}><Trash2 size={16}/> {deleting?'Cancel account deletion':'Delete my account and data'}</button>
      {deleting&&<form onSubmit={e=>void remove(e)}>
        <p>This permanently deletes your login and cloud task history. Export a backup before continuing.</p>
        <label>Confirm your password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        {error&&<p role="alert">{error}</p>}
        <button className="button button-secondary" type="submit" disabled={busy||!password}>{busy?'Deleting…':'Permanently delete my account'}</button>
      </form>}
    </div>
  </section>;
}
