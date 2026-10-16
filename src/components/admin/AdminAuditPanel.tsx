import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { AdminEvent } from '../../lib/adminApi';

/** Read-only audit trail, no user board payloads. */
export function AdminAuditPanel({audit,auditPage,setAuditPage,auditTotal}:{
  audit:AdminEvent[];auditPage:number;setAuditPage:Dispatch<SetStateAction<number>>;auditTotal:number;
}){
  const totalAuditPages=Math.max(1,Math.ceil(auditTotal/25));
  return <section className="panel admin-table-section"><h2>Administrator audit trail</h2><p>Who made changes, what changed and when. User task descriptions never appear here.</p>
          <div className="admin-table-scroll"><table><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Affected user</th></tr></thead><tbody>
            {audit.map(e=><tr key={e.id}><td>{new Date(e.when).toLocaleString('en-AU')}</td><td>{e.action}</td><td>{e.actor}</td><td>{e.subject||'—'}</td></tr>)}
          </tbody></table></div>
          <div className="admin-pagination"><button disabled={auditPage<=1} onClick={()=>setAuditPage(n=>n-1)}><ChevronLeft size={17}/> Previous</button><span>Page {auditPage} of {totalAuditPages}</span><button disabled={auditPage>=totalAuditPages} onClick={()=>setAuditPage(n=>n+1)}>Next <ChevronRight size={17}/></button></div>
        </section>;
}
