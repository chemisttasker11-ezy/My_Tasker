import { Settings2 } from 'lucide-react';
import type { AdminHealth } from '../../lib/adminApi';

/** Administrative configuration health without revealing credential values. */
export function AdminSecurityPanel({health}:{health:AdminHealth|null}){
  return <section className="panel admin-table-section"><h2>Service security and readiness</h2>
          <div className="admin-security-list">{[
            ['Email delivery configured',health?.smtp_configured],['CAPTCHA configured',health?.captcha_configured],
            ['Authenticator mandatory',health?.authenticator_required],['HTTPS required',health?.https_required]
          ].map(([label,ok])=><div key={label as string}><span><Settings2 size={18}/>{label as string}</span><strong className={ok?'ready':'needs-attention'}>{ok?'Configured':'Needs attention'}</strong></div>)}</div>
          <p>Backend: {health?.environment??'unknown'} · Storage: {health?.board_storage??'unknown'} · MFA session: {health?.session_window_hours??'—'} hours</p>
          <p>Secrets are intentionally never visible in the dashboard.</p>
        </section>;
}
