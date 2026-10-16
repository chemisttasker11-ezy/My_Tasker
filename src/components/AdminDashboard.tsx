import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { AdminOverviewPanel } from './admin/AdminOverviewPanel';
import { AdminUsersPanel } from './admin/AdminUsersPanel';
import { AdminAuditPanel } from './admin/AdminAuditPanel';
import { AdminSecurityPanel } from './admin/AdminSecurityPanel';
import * as admin from '../lib/adminApi';

type Tab='overview'|'users'|'audit'|'security';
const TABS:{id:Tab;title:string}[]=[
  {id:'overview',title:'Overview'},{id:'users',title:'Users'},{id:'audit',title:'Audit log'},{id:'security',title:'Security health'}
];
export function AdminDashboard({owner,onPersonalPlanner,onSignOut}:{
  owner:boolean;onPersonalPlanner:()=>void|Promise<void>;onSignOut:()=>Promise<void>;
}){
  const [tab,setTab]=useState<Tab>('overview');
  const [overview,setOverview]=useState<admin.AdminStats|null>(null);
  const [users,setUsers]=useState<admin.AdminUser[]>([]);
  const [usersPage,setUsersPage]=useState(1);
  const [usersTotal,setUsersTotal]=useState(0);
  const [search,setSearch]=useState('');
  const [appliedSearch,setAppliedSearch]=useState('');
  const [audit,setAudit]=useState<admin.AdminEvent[]>([]);
  const [auditPage,setAuditPage]=useState(1);
  const [auditTotal,setAuditTotal]=useState(0);
  const [health,setHealth]=useState<admin.AdminHealth|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [feedback,setFeedback]=useState('');
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let mounted=true;setBusy(true);setError('');
    void Promise.all([admin.overview(),admin.users(usersPage,appliedSearch),admin.events(auditPage),admin.health()])
      .then(([summary,accounts,logs,security])=>{
        if(!mounted)return;
        setOverview(summary);setUsers(accounts.users);setUsersTotal(accounts.total);
        setAudit(logs.events);setAuditTotal(logs.total);setHealth(security);
      }).catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Failed to load admin information.');})
      .finally(()=>{if(mounted)setBusy(false)});
    return()=>{mounted=false};
  },[usersPage,appliedSearch,auditPage,refresh]);
  async function act(action:()=>Promise<unknown>,label:string){
    if(!window.confirm(label+'? This action will be recorded in the audit log.'))return;
    setBusy(true);setError('');setFeedback('');
    try{await action();setFeedback('Action completed.');setRefresh(n=>n+1);}
    catch(e){setError(e instanceof Error?e.message:'Action failed.');setBusy(false)}
  }
  function searchUsers(event:FormEvent<HTMLFormElement>){event.preventDefault();setUsersPage(1);setAppliedSearch(search.trim())}
  return <div className="admin-shell">
    <a className="skip-link" href="#admin-main">Skip to administration</a>
    <header className="admin-header">
      <div className="admin-brand"><span><ShieldCheck size={24}/></span><div><strong>mytasker <em>CONTROL</em></strong><small>Protected administration</small></div></div>
      <div className="admin-header-actions"><span className="admin-mfa-badge"><LockKeyhole size={15}/> MFA verified</span><button className="button button-secondary" onClick={()=>void onPersonalPlanner()}><ArrowLeft size={17}/> My planner</button><button aria-label="Sign out of admin" className="button button-secondary" onClick={()=>void onSignOut()}><LogOut size={17}/> Sign out</button></div>
    </header>
    <div className="admin-layout">
      <nav className="admin-nav" aria-label="Administration">
        {TABS.map(item=><button type="button" key={item.id} onClick={()=>setTab(item.id)} className={tab===item.id?'active':''} aria-current={tab===item.id?'page':undefined}>{item.title}</button>)}
      </nav>
      <main className="admin-content" id="admin-main">
        <div className="admin-page-heading"><div><span className="auth-eyebrow">ACCOUNT SECURITY</span><h1>{TABS.find(x=>x.id===tab)?.title}</h1><p>Security first. Administrators cannot read other users' private task boards.</p></div><button className="button button-secondary" onClick={()=>setRefresh(n=>n+1)} disabled={busy}><RefreshCw size={18}/> Refresh</button></div>
        {error&&<p className="auth-alert" role="alert">{error}</p>}
        {feedback&&<p className="auth-notice" role="status">{feedback}</p>}
        {tab==='overview'&&<AdminOverviewPanel overview={overview}/>}
        {tab==='users'&&<AdminUsersPanel users={users} usersTotal={usersTotal} usersPage={usersPage}
          setUsersPage={setUsersPage} search={search} setSearch={setSearch} onSearch={searchUsers}
          owner={owner} busy={busy}
          onChangeStatus={u=>void act(()=>admin.changeStatus(u.id,!u.active),u.active?'Suspend '+u.email:'Reactivate '+u.email)}
          onRevoke={u=>void act(()=>admin.revoke(u.id),'Revoke all sessions for '+u.email)}
          onChangeStaff={u=>void act(()=>admin.changeStaff(u.id,!u.staff),u.staff?'Revoke staff for '+u.email:'Grant staff to '+u.email)}
        />}
        {tab==='audit'&&<AdminAuditPanel audit={audit} auditPage={auditPage}
          setAuditPage={setAuditPage} auditTotal={auditTotal}/>}
        {tab==='security'&&<AdminSecurityPanel health={health}/>}
        {busy&&<p role="status" className="admin-loading">Refreshing verified admin data…</p>}
      </main>
    </div>
  </div>;
}
