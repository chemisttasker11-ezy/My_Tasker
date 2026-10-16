import { useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import App from '../App';
import * as api from '../lib/authApi';
import * as admin from '../lib/adminApi';
import { AuthPage } from './AuthPage';
import { AdminMfaPage } from './AdminMfaPage';
import { AdminDashboard } from './AdminDashboard';

interface ActiveSession { user:api.SignedInUser; data:api.CloudSnapshot }
const localDemo=import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE==='1';

/** Production always requires server verified accounts; admin privileges additionally need MFA. */
export function AuthGate() {
  const [session,setSession]=useState<ActiveSession|null>(null);
  const [loading,setLoading]=useState(!localDemo);
  const [error,setError]=useState('');
  const [siteKey,setSiteKey]=useState('');
  const [adminStage,setAdminStage]=useState<admin.AdminStage>('login');
  const [adminOwner,setAdminOwner]=useState(false);
  const [adminPortal,setAdminPortal]=useState(true);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    if(localDemo)return;
    let active=true;
    void Promise.all([api.getSession(),api.config(),admin.status()]).then(async([user,configuration,challenge])=>{
      if(!active)return;
      setSiteKey(configuration.captcha_site_key);
      setAdminStage(challenge.stage);
      setAdminOwner(Boolean(challenge.user?.owner));
      if(user){
        const data=await api.loadBoard();
        if(active)setSession({user,data});
      } else setSession(null);
      setError('');
    }).catch(err=>{if(active)setError(err instanceof Error?err.message:'Unable to connect');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false};
  },[refresh]);
  async function signOut(){
    await api.logout();
    setSession(null);setAdminStage('login');setAdminPortal(true);
  }
  async function adminVerified(response:admin.AdminVerified) {
    const data=await api.loadBoard();
    setSession({user:response.user,data});
    setAdminOwner(response.user.owner);
    setAdminStage('ready');setAdminPortal(true);
  }
  if(localDemo)return <App/>;
  if(loading)return <div className="auth-loading" role="status"><LoaderCircle size={28}/> Connecting to your private tasker…</div>;
  if(error&&!session)return <div className="auth-connection-error" role="alert"><h1>Unable to connect</h1><p>{error}</p><button className="button button-primary" onClick={()=>{setLoading(true);setRefresh(n=>n+1)}}><RefreshCw size={17}/> Try again</button></div>;
  if(adminStage==='challenge'||adminStage==='enroll')return <AdminMfaPage stage={adminStage}
    onAuthenticated={adminVerified} onBack={async()=>{await api.logout();setAdminStage('login');setSession(null)}}/>;
  if(!session)return <AuthPage captchaKey={siteKey} onAuthenticated={async result=>{
    if('admin_challenge' in result){
      setAdminStage(result.enrolled?'challenge':'enroll');
    }else{
      const data=await api.loadBoard();
      setSession({user:result.user,data});
      setAdminStage('login');
    }
  }}/>;
  if(adminStage==='ready'&&adminPortal)return <AdminDashboard owner={adminOwner}
    onPersonalPlanner={async()=>{
      try {
        const data=await api.loadBoard();
        setSession(current=>current?{...current,data}:current);
        setAdminPortal(false);
      }catch(e){setError(e instanceof Error?e.message:'Unable to load your private planner');}
    }} onSignOut={signOut}/>;
  return <App key={session.user.id} account={session.user} initialCloud={session.data}
    onSignOut={signOut} onAdminReturn={adminStage==='ready'?()=>setAdminPortal(true):undefined}/>;
}
