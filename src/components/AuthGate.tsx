import { useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import App from '../App';
import * as api from '../lib/authApi';
import { AuthPage } from './AuthPage';

interface ActiveSession { user:api.SignedInUser; data:api.CloudSnapshot }
const localDemo=import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE==='1';

/** Production always requires server-authenticated, verified accounts. */
export function AuthGate() {
  const [session,setSession]=useState<ActiveSession|null>(null);
  const [loading,setLoading]=useState(!localDemo);
  const [error,setError]=useState('');
  const [siteKey,setSiteKey]=useState('');
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    if(localDemo)return;
    let active=true;
    void Promise.all([api.getSession(),api.config()]).then(async([user,configuration])=>{
      if(!active)return;
      setSiteKey(configuration.captcha_site_key);
      if(user){const data=await api.loadBoard();if(active)setSession({user,data});}
      else setSession(null);
      setError('');
    }).catch(err=>{if(active)setError(err instanceof Error?err.message:'Unable to connect');})
    .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false};
  },[refresh]);
  if(localDemo)return <App/>;
  if(loading)return <div className="auth-loading" role="status"><LoaderCircle size={28}/> Connecting to your private tasker…</div>;
  if(error&&!session)return <div className="auth-connection-error" role="alert"><h1>We couldn't connect your account</h1><p>{error}</p><button className="button button-primary" onClick={()=>{setLoading(true);setRefresh(n=>n+1)}}><RefreshCw size={17}/> Try again</button></div>;
  if(!session)return <AuthPage captchaKey={siteKey} onAuthenticated={async user=>{
    const data=await api.loadBoard();
    setSession({user,data});
  }}/>;
  return <App key={session.user.id} account={session.user} initialCloud={session.data}
    onSignOut={async()=>{await api.logout();setSession(null)}}/>;
}
