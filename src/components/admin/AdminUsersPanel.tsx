import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { FormEvent, Dispatch, SetStateAction } from 'react';
import type { AdminUser } from '../../lib/adminApi';
interface Props {
  users: AdminUser[]; usersTotal:number; usersPage:number;
  setUsersPage: Dispatch<SetStateAction<number>>;
  search:string; setSearch:Dispatch<SetStateAction<string>>;
  onSearch:(event:FormEvent<HTMLFormElement>)=>void;
  owner:boolean; busy:boolean;
  onChangeStatus:(user:AdminUser)=>void;
  onRevoke:(user:AdminUser)=>void;
  onChangeStaff:(user:AdminUser)=>void;
}
/** Presentation only. Every user mutation is delegated to the authorised admin controller. */
export function AdminUsersPanel({users,usersTotal,usersPage,setUsersPage,search,setSearch,
  onSearch,owner,busy,onChangeStatus,onRevoke,onChangeStaff}:Props){
  const totalPages=Math.max(1,Math.ceil(usersTotal/20));
  const searchUsers=onSearch;
  return <section className="panel admin-table-section">
          <div className="admin-user-tools"><div><h2>User accounts</h2><p>Only verified superusers can change account status, revoke sessions or grant staff access.</p></div>
            <form onSubmit={searchUsers}><label className="plan-search"><Search size={17}/><input aria-label="Search users" value={search} placeholder="Search email" onChange={e=>setSearch(e.target.value)}/></label><button className="button button-primary" type="submit">Search</button></form></div>
          <div className="admin-table-scroll"><table><thead><tr><th>Account</th><th>Status</th><th>Role</th><th>Joined</th><th>Controls</th></tr></thead><tbody>
            {users.map(u=><tr key={u.id}><td><strong>{u.email}</strong><small>#{u.id}{u.verified_mfa?' · Authenticator enrolled':''}</small></td>
              <td>{u.active?'Active':'Inactive'}</td><td>{u.owner?'Owner':u.staff?'Administrator':'User'}</td><td>{new Date(u.joined).toLocaleDateString('en-AU')}</td>
              <td><div className="admin-row-actions">
                {owner&&!u.owner&&<>
                  <button type="button" disabled={busy||!u.email_verified} onClick={()=>onChangeStatus(u)}>{u.active?'Suspend':'Reactivate'}</button>
                  <button type="button" disabled={busy} onClick={()=>onRevoke(u)}>Revoke sessions</button>
                  <button type="button" disabled={busy||!u.active||!u.email_verified} onClick={()=>onChangeStaff(u)}>{u.staff?'Remove admin':'Grant admin'}</button>
                </>}
                {(!owner||u.owner)&&<span>View only</span>}
              </div></td>
            </tr>)}
          </tbody></table></div>
          {!users.length&&<p>No accounts match this search.</p>}
          <div className="admin-pagination"><button disabled={usersPage<=1} onClick={()=>setUsersPage(n=>n-1)}><ChevronLeft size={17}/> Previous</button><span>Page {usersPage} of {totalPages} · {usersTotal} users</span><button disabled={usersPage>=totalPages} onClick={()=>setUsersPage(n=>n+1)}>Next <ChevronRight size={17}/></button></div>
        </section>;
}
