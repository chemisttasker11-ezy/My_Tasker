import { useState, type ReactNode } from 'react';
import type { View } from '../model';
import { longToday } from '../lib/display';
import { Archive, CalendarDays, CalendarRange, BarChart3, Check, CheckCircle2, ChevronRight, LayoutDashboard, ListTodo, Menu, Moon, Plus, Settings2, Sparkles, Sun, Target, X, Library, Quote, Printer, LogOut, CircleHelp, ShieldCheck } from 'lucide-react';
const ICONS = { overview: LayoutDashboard, board: ListTodo, today: Sun, week: BarChart3, calendar: CalendarRange, upcoming: CalendarDays, goals: Target, completed: CheckCircle2, archived: Archive, settings: Settings2, library: Library, quotes: Quote, tracker: Printer };
const NAV: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'board', label: 'My task board' },
  { id: 'today', label: 'Today' }, { id: 'week', label: 'Week planner' }, { id: 'calendar', label: 'Calendar' }, { id: 'upcoming', label: 'Upcoming' },
  { id: 'goals', label: 'Long-term goals' }, { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived tasks' }, { id: 'library', label: 'Life task library' }, { id: 'tracker', label: 'Printable tracker' }, { id: 'quotes', label: 'Direction & quotes' }
];


interface WorkspaceChromeProps {
  view:View;day:string;theme:'light'|'dark';todayCount:number;goalsCount:number;
  accountEmail?:string;onNavigate:(next:View)=>void;onThemeToggle:()=>void;onNewTask:()=>void;
  onGuide?:()=>void;onSignOut?:()=>void;onAdminReturn?:()=>void;
  children:ReactNode;overlays?:ReactNode;
}
/** Navigation and shell only. It never owns tasks, persistence or scoring. */
export function WorkspaceChrome({view,day,theme,todayCount,goalsCount,accountEmail,
  onNavigate,onThemeToggle,onNewTask,onGuide,onSignOut,onAdminReturn,children,overlays}:WorkspaceChromeProps){
  const [mobileNav,setMobileNav]=useState(false);
  const selectedNav=NAV.find(n=>n.id===view);
  function go(next:View){setMobileNav(false);onNavigate(next);}
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Check size={21} strokeWidth={3}/></div><div className="brand-name">My<span>Tasker</span><strong>MAKE ROOM FOR LIFE</strong></div><button className="icon-button mobile-close" type="button" aria-label="Close menu" onClick={() => setMobileNav(false)}><X size={20}/></button></div>
      <div className="workspace-label">YOUR WORKSPACE <span className="workspace-dot" /></div>
      <nav id="main-navigation" className="side-nav" aria-label="Main navigation">
        <p className="nav-section">WORKSPACE</p>
        {NAV.map(n => {
          const Icon = ICONS[n.id];
          const count = n.id === 'today' ? todayCount : n.id === 'goals' ? goalsCount : undefined;
          return <button key={n.id} className={`nav-link ${view === n.id ? 'selected' : ''}`} aria-current={view === n.id ? 'page' : undefined} onClick={() => go(n.id)}><Icon size={19} strokeWidth={1.9}/><span>{n.label}</span>{typeof count === 'number' && <span className="nav-count">{count}</span>}</button>;
        })}
        <p className="nav-section">PREFERENCES</p>
        <button className={`nav-link ${view === 'settings' ? 'selected' : ''}`} onClick={() => go('settings')}><Settings2 size={19}/><span>Settings & backup</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="side-note-icon"><Sparkles size={18}/></div><p><strong>Little steps. Big progress.</strong><br/>Stay focused on what matters, one task at a time.</p><div className="sidebar-avatar"><div className="avatar">MC</div><div><strong>My workspace</strong><span>{accountEmail ? 'Private account sync' : 'Private to this browser'}</span></div><span className="online-dot"/></div></div>
    </aside>
    {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open menu" aria-controls="main-navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Menu size={23}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{view === 'board' ? 'Task board' : view === 'settings' ? 'Settings' : selectedNav?.label}</strong></div></div><div className="topbar-right">{accountEmail && onAdminReturn && <button type="button" className="icon-button" aria-label="Return to secured admin" title="Admin dashboard" onClick={()=>void onAdminReturn?.()}><ShieldCheck size={19}/></button>}{accountEmail && <button type="button" className="icon-button auth-help-top" aria-label="Show getting started guide" onClick={() => onGuide?.()}><CircleHelp size={19}/></button>}<span className="date-chip"><CalendarDays size={16}/>{longToday(day)}</span><button className="icon-button theme-toggle" aria-label="Toggle light or dark theme" onClick={() => onThemeToggle()}>{theme === 'light' ? <Moon size={19}/> : <Sun size={19}/>}</button><button className="top-add" onClick={() => onNewTask()}><Plus size={18}/> <span>New task</span></button>
        {accountEmail && <button className="icon-button auth-logout-top" type="button" aria-label="Save and sign out" onClick={() => void onSignOut?.()}><LogOut size={20}/></button>}</div></header>

    <main className="content" id="main-content" tabIndex={-1}>{children}</main>
    </div>
    {overlays}
  </div>;
}
