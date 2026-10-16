import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, Eye, FileClock, LockKeyhole, LogOut, RefreshCw, Search, Settings2, ShieldCheck, Users, UserX, UserRoundCheck } from 'lucide-react';
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
  const metrics: {label:string;value:number|undefined;Icon:typeof Users}[]=[
    {label:'Total users',value:overview?.users.total,Icon:Users},
    {label:'Active',value:overview?.users.active,Icon:UserRoundCheck},
    {label:'Awaiting email verification',value:overview?.users.pending_verification,Icon:FileClock},
    {label:'New this week',value:overview?.users.new_last_7_days,Icon:Users},
    {label:'Administrators',value:overview?.users.admins,Icon:ShieldCheck},
    {label:'Stored task boards',value:overview?.users.saved_boards,Icon:ClipboardList},
  ];
  const totalPages=Math.max(1,Math.ceil(usersTotal/20)),totalAuditPages=Math.max(1,Math.ceil(auditTotal/25));
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
        {tab==='overview'&&<div className="admin-overview">
          <div className="admin-stats">
            {metrics.map(({label,value,Icon})=><div className="admin-stat" key={label}>
              <Icon size={24}/><span>{label}</span><strong>{value==null?'—':String(value)}</strong></div>)}
          </div>
          <section className="panel admin-table-section"><h2>Recent security activity</h2>
            {!overview?.activity.length?<p>No admin actions recorded yet.</p>:
              <div className="admin-table-scroll"><table><thead><tr><th>Action</th><th>Actor</th><th>Subject</th><th>Time</th></tr></thead><tbody>
                {overview.activity.map(e=><tr key={e.id}><td>{e.action}</td><td>{e.actor}</td><td>{e.subject||'—'}</td><td>{new Date(e.when).toLocaleString('en-AU')}</td></tr>)}
              </tbody></table></div>}
          </section>
        </div>}
        {tab==='users'&&<section className="panel admin-table-section">
          <div className="admin-user-tools"><div><h2>User accounts</h2><p>Only verified superusers can change account status, revoke sessions or grant staff access.</p></div>
            <form onSubmit={searchUsers}><label className="plan-search"><Search size={17}/><input aria-label="Search users" value={search} placeholder="Search email" onChange={e=>setSearch(e.target.value)}/></label><button className="button button-primary" type="submit">Search</button></form></div>
          <div className="admin-table-scroll"><table><thead><tr><th>Account</th><th>Status</th><th>Role</th><th>Joined</th><th>Controls</th></tr></thead><tbody>
            {users.map(u=><tr key={u.id}><td><strong>{u.email}</strong><small>#{u.id}{u.verified_mfa?' · Authenticator enrolled':''}</small></td>
              <td>{u.active?'Active':'Inactive'}</td><td>{u.owner?'Owner':u.staff?'Administrator':'User'}</td><td>{new Date(u.joined).toLocaleDateString('en-AU')}</td>
              <td><div className="admin-row-actions">
                {owner&&!u.owner&&<>
                  <button type="button" disabled={busy||!u.email_verified} onClick={()=>void act(()=>admin.changeStatus(u.id,!u.active),u.active?'Suspend '+u.email:'Reactivate '+u.email)}>{u.active?'Suspend':'Reactivate'}</button>
                  <button type="button" disabled={busy} onClick={()=>void act(()=>admin.revoke(u.id),'Revoke all sessions for '+u.email)}>Revoke sessions</button>
                  <button type="button" disabled={busy||!u.active||!u.email_verified} onClick={()=>void act(()=>admin.changeStaff(u.id,!u.staff),u.staff?'Revoke staff for '+u.email:'Grant staff to '+u.email)}>{u.staff?'Remove admin':'Grant admin'}</button>
                </>}
                {(!owner||u.owner)&&<span>View only</span>}
              </div></td>
            </tr>)}
          </tbody></table></div>
          {!users.length&&<p>No accounts match this search.</p>}
          <div className="admin-pagination"><button disabled={usersPage<=1} onClick={()=>setUsersPage(n=>n-1)}><ChevronLeft size={17}/> Previous</button><span>Page {usersPage} of {totalPages} · {usersTotal} users</span><button disabled={usersPage>=totalPages} onClick={()=>setUsersPage(n=>n+1)}>Next <ChevronRight size={17}/></button></div>
        </section>}
        {tab==='audit'&&<section className="panel admin-table-section"><h2>Administrator audit trail</h2><p>Who made changes, what changed and when. User task descriptions never appear here.</p>
          <div className="admin-table-scroll"><table><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Affected user</th></tr></thead><tbody>
            {audit.map(e=><tr key={e.id}><td>{new Date(e.when).toLocaleString('en-AU')}</td><td>{e.action}</td><td>{e.actor}</td><td>{e.subject||'—'}</td></tr>)}
          </tbody></table></div>
          <div className="admin-pagination"><button disabled={auditPage<=1} onClick={()=>setAuditPage(n=>n-1)}><ChevronLeft size={17}/> Previous</button><span>Page {auditPage} of {totalAuditPages}</span><button disabled={auditPage>=totalAuditPages} onClick={()=>setAuditPage(n=>n+1)}>Next <ChevronRight size={17}/></button></div>
        </section>}
        {tab==='security'&&<section className="panel admin-table-section"><h2>Service security and readiness</h2>
          <div className="admin-security-list">{[
            ['Email delivery configured',health?.smtp_configured],['CAPTCHA configured',health?.captcha_configured],
            ['Authenticator mandatory',health?.authenticator_required],['HTTPS required',health?.https_required]
          ].map(([label,ok])=><div key={label as string}><span><Settings2 size={18}/>{label as string}</span><strong className={ok?'ready':'needs-attention'}>{ok?'Configured':'Needs attention'}</strong></div>)}</div>
          <p>Backend: {health?.environment??'unknown'} · Storage: {health?.board_storage??'unknown'} · MFA session: {health?.session_window_hours??'—'} hours</p>
          <p>Secrets are intentionally never visible in the dashboard.</p>
        </section>}
        {busy&&<p role="status" className="admin-loading">Refreshing verified admin data…</p>}
      </main>
    </div>
  </div>;
}
