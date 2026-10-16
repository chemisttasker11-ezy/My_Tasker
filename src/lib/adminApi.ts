import { requestJSON, sendJSON, type SignedInUser } from './authApi';

export type AdminStage='login'|'challenge'|'enroll'|'ready';
export interface AdminStatus {stage: AdminStage;user?: {id?:number;email:string;owner?:boolean}}
export interface AdminVerified { user: SignedInUser & {owner:boolean};backup_codes?:string[]}
export interface AdminUser {
  id:number;email:string;active:boolean;staff:boolean;owner:boolean;joined:string;
  last_login:string|null;verified_mfa:boolean;email_verified?:boolean;
}
export interface AdminStats {
  users:{total:number;active:number;pending_verification:number;new_last_7_days:number;admins:number;saved_boards:number};
  activity:{id:number;actor:string;action:string;when:string;subject:string|null}[];
  permissions:{can_manage_users:boolean}
}
export interface AdminEvent {id:number;when:string;action:string;actor:string;subject:string|null;metadata:Record<string,unknown>}
export interface AdminHealth {smtp_configured:boolean;captcha_configured:boolean;authenticator_required:boolean;session_window_hours:number;https_required:boolean;environment:string;board_storage:string}
export const status=():Promise<AdminStatus>=>requestJSON('/api/admin/status/');
export const enroll=():Promise<{qr:string;secret:string;uri:string;expires_in_seconds:number}>=>
  sendJSON('/api/admin/enroll/',{});
export const verify=(code:string):Promise<AdminVerified>=>sendJSON('/api/admin/verify/',{code});
export const overview=():Promise<AdminStats>=>requestJSON('/api/admin/overview/');
export const users=(page:number,q:string):Promise<{users:AdminUser[];page:number;total:number;per_page:number}>=>
  requestJSON('/api/admin/users/?page='+page+'&q='+encodeURIComponent(q));
export const events=(page:number):Promise<{events:AdminEvent[];page:number;total:number;per_page:number}>=>
  requestJSON('/api/admin/audit/?page='+page);
export const health=():Promise<AdminHealth>=>requestJSON('/api/admin/health/');
export const changeStatus=(id:number,active:boolean)=>sendJSON<{user:AdminUser}>(`/api/admin/users/${id}/status/`,{active});
export const changeStaff=(id:number,staff:boolean)=>sendJSON<{user:AdminUser}>(`/api/admin/users/${id}/staff/`,{staff});
export const revoke=(id:number)=>sendJSON<{detail:string}>(`/api/admin/users/${id}/sessions/`,{});
