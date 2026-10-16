import { ClipboardList, FileClock, ShieldCheck, Users, UserRoundCheck } from 'lucide-react';
import type { AdminStats } from '../../lib/adminApi';

/** Dashboard summary deliberately contains counts, not private task content. */
export function AdminOverviewPanel({overview}:{overview:AdminStats|null}){
  const metrics: {label:string;value:number|undefined;Icon:typeof Users}[]=[
    {label:'Total users',value:overview?.users.total,Icon:Users},
    {label:'Active',value:overview?.users.active,Icon:UserRoundCheck},
    {label:'Awaiting email verification',value:overview?.users.pending_verification,Icon:FileClock},
    {label:'New this week',value:overview?.users.new_last_7_days,Icon:Users},
    {label:'Administrators',value:overview?.users.admins,Icon:ShieldCheck},
    {label:'Stored task boards',value:overview?.users.saved_boards,Icon:ClipboardList},
  ];

  return <div className="admin-overview">
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
        </div>;
}
