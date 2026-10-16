import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, CalendarDays, CalendarRange, BarChart3, Check, CheckCircle2, ChevronRight, LayoutDashboard, ListTodo, Menu, Moon, Plus, Settings2, Sparkles, Sun, Target, X } from 'lucide-react';
import { type BoardState, type Category, type Lane, type Priority, type Task, type TaskStatus, type View, STORAGE_KEY, brisbaneToday, duplicateTask as cloneTask, initialState, isCompleted, moveInBoard, readState, rescheduleTask, saveTaskChanges, saveWeekReview, setTaskStatus, setWeekCommitment, toggleCompletion, toggleDailyFocus, validateImported } from './model';
import { activeItem, downloadable, LANE_LABEL, longToday } from './lib/display';
import { TaskModal } from './components/TaskModal';
import { OverviewView } from './views/OverviewView';
import { BoardView } from './views/BoardView';
import { TodayView } from './views/TodayView';
import { UpcomingView } from './views/UpcomingView';
import { GoalsView } from './views/GoalsView';
import { CompletedView } from './views/CompletedView';
import { SettingsView } from './views/SettingsView';
import { ArchivedView } from './views/ArchivedView';
import { CalendarView } from './views/CalendarView';
import { visibleStatus } from './lib/progress';
import { mondayOf } from './lib/calendar';
import { scoreWeek } from './lib/scoring';
import { WeekPlannerView } from './views/WeekPlannerView';
import { addEntry, cloneEntry, moveEntry, editEntry, removeEntry, toggleEntryStep, copyDays, pasteDays, setWeekCapacity, type DayClipboard } from './lib/planning';
import type { PlanningActions } from './components/PlanWorkspace';
import { LibraryView } from './views/LibraryView';
import { QuotesView } from './views/QuotesView';
import type { TrackerLaunch } from './views/TrackerView';
import { AreasContext } from './lib/areas';
import { addLifeTemplates } from './lib/lifeLibrary';
import { dailyQuote, quoteSettings } from './lib/quotes';
import { relevantTasksForDate } from './lib/planProjection';
import { Library, Quote, Printer, LogOut, CircleHelp, ShieldCheck } from 'lucide-react';
import { WelcomeGuide } from './components/WelcomeGuide';
import { sampleBoard } from './lib/sampleBoard';
import { saveBoard as saveCloudBoard, type CloudSnapshot, type SignedInUser } from './lib/authApi';
const TrackerView = lazy(() => import('./views/TrackerView').then(module => ({ default: module.TrackerView })));

const ICONS = { overview: LayoutDashboard, board: ListTodo, today: Sun, week: BarChart3, calendar: CalendarRange, upcoming: CalendarDays, goals: Target, completed: CheckCircle2, archived: Archive, settings: Settings2, library: Library, quotes: Quote, tracker: Printer };
const NAV: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'board', label: 'My task board' },
  { id: 'today', label: 'Today' }, { id: 'week', label: 'Week planner' }, { id: 'calendar', label: 'Calendar' }, { id: 'upcoming', label: 'Upcoming' },
  { id: 'goals', label: 'Long-term goals' }, { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived tasks' }, { id: 'library', label: 'Life task library' }, { id: 'tracker', label: 'Printable tracker' }, { id: 'quotes', label: 'Direction & quotes' }
];

interface AppProps {
  account?: SignedInUser;
  initialCloud?: CloudSnapshot;
  onSignOut?: () => Promise<void>;
  onAdminReturn?: () => void;
}
export default function App({ account, initialCloud, onSignOut, onAdminReturn }: AppProps = {}) {
  const [board, setBoard] = useState<BoardState>(() =>
    account ? (initialCloud?.board ? validateImported(initialCloud.board) : sampleBoard()) : readState());
  const lastPersisted = useRef(JSON.stringify(board));
  const cloudSaved = useRef(JSON.stringify(initialCloud?.board ?? null));
  const cloudRevision = useRef(initialCloud?.revision ?? 0);
  const cloudQueue = useRef<Promise<void>>(Promise.resolve());
  const cloudBlocked = useRef(false);
  const [cloudFailure, setCloudFailure] = useState('');
  const guideKey = account ? `mytasker-guide:${account.id}` : '';
  const [guideOpen, setGuideOpen] = useState(() => Boolean(account && !localStorage.getItem(guideKey)));
  const closeGuide = () => { setGuideOpen(false); if (guideKey) localStorage.setItem(guideKey,'seen'); };
  const [view, setView] = useState<View>('overview');
  const [selectedLane, setSelectedLane] = useState<Lane>('urgent');
  const [editor, setEditor] = useState<{ task: Task | null; lane: Lane; date?: string; isCopy?: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'All'>('All');
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState(false);
  const [dayClipboard, setDayClipboard] = useState<DayClipboard | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const day = brisbaneToday();
  const [trackerLaunch, setTrackerLaunch] = useState<TrackerLaunch>({ anchor: day, scale: 'day' });
  const active = useMemo(() => board.tasks.filter(activeItem), [board.tasks]);
  const completed = (task: Task) => isCompleted(task, board.completions, day);
  const visible = useMemo(() => active.filter(t =>
    (categoryFilter === 'All' || t.category === categoryFilter) &&
    (priorityFilter === 'All' || t.priority === priorityFilter) &&
    (!search.trim() || `${t.title} ${t.description} ${t.category}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()))
  ), [active, categoryFilter, priorityFilter, search]);
  const outstanding = active.filter(t => !completed(t));
  const todayTasks = outstanding.filter(t => t.status !== 'postponed' && (t.lane === 'daily' || t.lane === 'urgent' || (t.dueDate && t.dueDate <= day)));
  const doneToday = board.completions.filter(c => brisbaneToday(new Date(c.completedAt)) === day).length;
  const goals = active.filter(t => t.lane === 'goals');
  const currentWeekStart = mondayOf(day);
  const currentWeekScore = useMemo(() => scoreWeek(board.weekPlans?.[currentWeekStart], board, currentWeekStart, day), [board, currentWeekStart, day]);

  useEffect(() => {
    document.documentElement.dataset.theme = board.theme;
    if (account) return;
    const encoded = JSON.stringify(board);
    if (encoded === lastPersisted.current) return;
    try { localStorage.setItem(STORAGE_KEY, encoded); lastPersisted.current = encoded; setSaveError(false); }
    catch { setSaveError(true); }
  }, [board, account]);

  useEffect(() => {
    if (!account || cloudBlocked.current) return;
    const snapshot = JSON.stringify(board);
    if (snapshot === cloudSaved.current) return;
    const timer = window.setTimeout(() => {
      cloudQueue.current = cloudQueue.current.then(async () => {
        if (cloudBlocked.current || cloudSaved.current === snapshot) return;
        const saved = await saveCloudBoard(JSON.parse(snapshot) as BoardState, cloudRevision.current);
        cloudRevision.current = saved.revision;
        cloudSaved.current = snapshot;
        setSaveError(false);
      }).catch((error: unknown) => {
        cloudBlocked.current = true;
        setCloudFailure(error instanceof Error ? error.message : 'Could not save to your account.');
        setSaveError(true);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [board, account]);

  useEffect(() => {
    if (account) return;
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { const incoming = validateImported(JSON.parse(event.newValue)); lastPersisted.current = JSON.stringify(incoming); setBoard(incoming); } catch { /* Keep the current board if another tab wrote invalid data. */ }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [account]);
  useEffect(() => {
    if (categoryFilter !== 'All' && !board.areas.some(a => a.id === categoryFilter)) setCategoryFilter('All');
  }, [board.areas, categoryFilter]);

  function alertNotice(message: string) { setNotice(message); }
  function navigate(next: View) { setView(next); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function showEditor(task: Task | null, lane: Lane = 'urgent', date = '') { setEditor({ task, lane, date }); }
  function duplicateTask(task: Task) { setEditor({ task: cloneTask(task), lane: task.lane, isCopy: true }); }
  function saveTask(task: Task) {
    setBoard(s => saveTaskChanges(s, task));
    setEditor(null); alertNotice('Task saved');
  }
  function changeStatus(id: string, status: TaskStatus, postponedTo?: string) {
    setBoard(s => setTaskStatus(s, id, status, postponedTo));
    alertNotice(status === 'postponed' ? 'Task postponed to its new date' : `Status updated`);
  }
  function includeInWeek(weekStart: string, id: string, include: boolean) {
    const task = board.tasks.find(item => item.id === id);
    if (!task) return;
    setBoard(state => setWeekCommitment(state, weekStart, task, include));
    alertNotice(include ? 'Added to weekly commitments' : 'Removed from weekly commitments');
  }
  function chooseDailyFocus(date: string, id: string) {
    const selected = board.dailyFocus?.[date] ?? [];
    if (!selected.includes(id) && selected.length >= 3) {
      alertNotice('Choose no more than three priorities per day');
      return;
    }
    setBoard(state => toggleDailyFocus(state, date, id));
    alertNotice(selected.includes(id) ? 'Removed from daily priorities' : 'Added to daily priorities');
  }
  function saveReview(weekStart: string, notes: { wins: string; blockers: string; adjustment: string }) {
    setBoard(state => {
      const percent = scoreWeek(state.weekPlans?.[weekStart], state, weekStart, brisbaneToday()).percent;
      return saveWeekReview(state, weekStart, notes, percent);
    });
    alertNotice('Weekly review saved');
  }
  const planActions: PlanningActions = {
    add: (id, date) => { setBoard(s => addEntry(s,id,date)); alertNotice('Added an independent copy to your plan'); },
    clone: (id, date) => { setBoard(s => cloneEntry(s,id,date)); alertNotice('Duplicated plan task'); },
    move: (id, date, index) => setBoard(s => moveEntry(s,id,date,index)),
    update: (id, patch) => setBoard(s => editEntry(s,id,patch)),
    remove: id => { setBoard(s => removeEntry(s,id)); alertNotice('Removed from day; board task preserved'); },
    toggleStep: (id, step) => setBoard(s => toggleEntryStep(s,id,step)),
    copy: dates => { setDayClipboard(copyDays(board,dates)); alertNotice('Days copied. Select destination day(s) and Paste.'); },
    paste: (dates,mode) => {
      if (!dayClipboard) return;
      const next = pasteDays(board,dayClipboard,dates,mode);
      if(next === board) { alertNotice('Choose matching dates: 1 source to many, same count, or multiple days to one starting date.');return; }
      setBoard(next); alertNotice('Day plan pasted with independent task progress');
    },
    clipboard: dayClipboard,
    focus: chooseDailyFocus
  };
  function rescheduleCalendarTask(id: string, date: string) {
    setBoard(s => rescheduleTask(s, id, date));
    alertNotice(date ? 'Calendar date updated' : 'Removed from calendar; still on task board');
  }
  function moveTask(id: string, lane: Lane, overId?: string) {
    setBoard(state => moveInBoard(state, id, lane, overId));
    alertNotice(`Moved to ${LANE_LABEL[lane]}`);
  }
  function archiveTask(id: string) {
    const task = board.tasks.find(t => t.id === id);
    if (!task || !window.confirm(`Archive “${task.title}”? You can restore it from Archived tasks.`)) return;
    setBoard(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, archivedAt: new Date().toISOString() } : t) }));
    alertNotice('Task archived');
  }
  function restoreArchived(id: string) {
    setBoard(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, archivedAt: '' } : t) }));
    alertNotice('Task restored');
  }
  function deleteArchived(id: string) {
    const task = board.tasks.find(t => t.id === id);
    if (!task?.archivedAt || !window.confirm(`Permanently delete “${task.title}” and its completion history? This cannot be undone.`)) return;
    setBoard(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id), completions: s.completions.filter(c => c.taskId !== id) }));
    alertNotice('Archived task deleted');
  }
  function toggleTask(id: string) {
    setBoard(s => toggleCompletion(s, id));
    alertNotice('Progress updated');
  }
  function toggleSubtask(taskId: string, subtaskId: string) {
    setBoard(s => ({ ...s, tasks: s.tasks.map(t => t.id !== taskId ? t : { ...t, updatedAt: new Date().toISOString(), subtasks: t.subtasks.map(st => st.id === subtaskId ? { ...st, done: !st.done } : st) }) }));
  }
  function exportData() { downloadable(`my-command-centre-${day}.json`, JSON.stringify(board, null, 2)); alertNotice('Backup downloaded'); }
  async function importData(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alertNotice('Backup file is too large (10 MB limit)'); return; }
    try {
      const incoming = validateImported(JSON.parse(await file.text()));
      if (!window.confirm('Replace all current tasks with this backup? Export a backup first if you want to keep what you have.')) return;
      setBoard(incoming); alertNotice('Backup restored');
    } catch (err) { alertNotice(err instanceof Error ? err.message : 'Could not import backup'); }
    finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
  }
  function reset() {
    if (!window.confirm('Replace ALL tasks and history? Export a backup first if you want to keep your work.')) return;
    setBoard(account ? sampleBoard() : initialState());
    navigate('overview'); alertNotice('Starter tasks restored');
  }
  async function leaveSafely(afterSave:()=>void|Promise<void>) {
    if (!account) return;
    await cloudQueue.current;
    if (cloudBlocked.current) { alertNotice('Cloud save failed. Export a backup before signing out.'); return; }
    const snapshot = JSON.stringify(board);
    if (cloudSaved.current !== snapshot) {
      try {
        const response = await saveCloudBoard(board, cloudRevision.current);
        cloudRevision.current = response.revision;
        cloudSaved.current = snapshot;
      } catch (error) {
        cloudBlocked.current = true; setSaveError(true);
        setCloudFailure(error instanceof Error ? error.message : 'Cloud save could not complete.');
        return;
      }
    }
    try { await afterSave(); }
    catch (error) { alertNotice(error instanceof Error ? error.message : 'Unable to leave safely.'); }
  }
  async function signOutSafely() { if (onSignOut) await leaveSafely(onSignOut); }
  async function returnToAdmin() { if (onAdminReturn) await leaveSafely(onAdminReturn); }
  function importFromThisBrowser() {
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (!legacy) { alertNotice('No earlier local task board was found.'); return; }
    try {
      const restored = validateImported(JSON.parse(legacy));
      if (!window.confirm('Replace your signed-in board with tasks saved in this browser? This will sync them to your account.')) return;
      setBoard(restored); alertNotice('Imported local tasks into your private account.');
    } catch (error) { alertNotice(error instanceof Error ? error.message : 'Could not read the local board.'); }
  }
  const selectedNav = NAV.find(n => n.id === view);
  const reminder = dailyQuote(board.quotes, day, relevantTasksForDate(board,day));
  function addTemplates(ids: string[]) {
    setBoard(current => addLifeTemplates(current, ids));
    alertNotice('Life tasks added with notes and checklists. Set dates whenever you are ready.');
  }

  return <AreasContext.Provider value={board.areas}><div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Check size={21} strokeWidth={3}/></div><div className="brand-name">My<span>Tasker</span><strong>MAKE ROOM FOR LIFE</strong></div><button className="icon-button mobile-close" type="button" aria-label="Close menu" onClick={() => setMobileNav(false)}><X size={20}/></button></div>
      <div className="workspace-label">YOUR WORKSPACE <span className="workspace-dot" /></div>
      <nav id="main-navigation" className="side-nav" aria-label="Main navigation">
        <p className="nav-section">WORKSPACE</p>
        {NAV.map(n => {
          const Icon = ICONS[n.id];
          const count = n.id === 'today' ? todayTasks.length : n.id === 'goals' ? goals.length : undefined;
          return <button key={n.id} className={`nav-link ${view === n.id ? 'selected' : ''}`} aria-current={view === n.id ? 'page' : undefined} onClick={() => navigate(n.id)}><Icon size={19} strokeWidth={1.9}/><span>{n.label}</span>{typeof count === 'number' && <span className="nav-count">{count}</span>}</button>;
        })}
        <p className="nav-section">PREFERENCES</p>
        <button className={`nav-link ${view === 'settings' ? 'selected' : ''}`} onClick={() => navigate('settings')}><Settings2 size={19}/><span>Settings & backup</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="side-note-icon"><Sparkles size={18}/></div><p><strong>Little steps. Big progress.</strong><br/>Stay focused on what matters, one task at a time.</p><div className="sidebar-avatar"><div className="avatar">MC</div><div><strong>My workspace</strong><span>Private to this browser</span></div><span className="online-dot"/></div></div>
    </aside>
    {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open menu" aria-controls="main-navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Menu size={23}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{view === 'board' ? 'Task board' : view === 'settings' ? 'Settings' : selectedNav?.label}</strong></div></div><div className="topbar-right">{account && onAdminReturn && <button type="button" className="icon-button" aria-label="Return to secured admin" title="Admin dashboard" onClick={()=>void returnToAdmin()}><ShieldCheck size={19}/></button>}{account && <button type="button" className="icon-button auth-help-top" aria-label="Show getting started guide" onClick={() => setGuideOpen(true)}><CircleHelp size={19}/></button>}<span className="date-chip"><CalendarDays size={16}/>{longToday(day)}</span><button className="icon-button theme-toggle" aria-label="Toggle light or dark theme" onClick={() => setBoard(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))}>{board.theme === 'light' ? <Moon size={19}/> : <Sun size={19}/>}</button><button className="top-add" onClick={() => showEditor(null, 'urgent')}><Plus size={18}/> <span>New task</span></button>
        {account && <button className="icon-button auth-logout-top" type="button" aria-label="Save and sign out" onClick={() => void signOutSafely()}><LogOut size={20}/></button>}</div></header>
      <main className="content" id="main-content" tabIndex={-1}>
        {saveError && <div className="save-warning" role="alert">{account ? `Your cloud changes could not be saved: ${cloudFailure}. Export a backup from Settings before leaving or reloading this page.` : 'Browser storage is unavailable or full. Export your work before leaving this page.'}</div>}
        {view !== 'tracker' && view !== 'quotes' && <section className="direction-banner" aria-label="Daily inspiration"><div><span>MY DIRECTION</span><p>{quoteSettings(board.quotes).direction || 'Choose a reminder of what matters to you.'}</p></div><div><span>TODAY’S REMINDER</span><p>{reminder.text}</p></div><button className="icon-button" aria-label="Edit direction and quotes" onClick={() => navigate('quotes')}><Quote size={18}/></button></section>}
        {view === 'library' && <LibraryView tasks={board.tasks} onAdd={addTemplates}/>}
        {view === 'quotes' && <QuotesView value={board.quotes} today={day} board={board} onChange={quotes => setBoard(current => ({ ...current, quotes }))}/>}
        {view === 'tracker' && <Suspense fallback={<p role="status">Loading your tracker…</p>}><TrackerView board={board} launch={trackerLaunch}/></Suspense>}
        {view === 'overview' && <OverviewView active={active} todayTasks={todayTasks} doneToday={doneToday} goals={goals} navigate={navigate} showEditor={showEditor} toggleTask={toggleTask} setSelectedLane={setSelectedLane} weekScore={currentWeekScore}/>}
        {view === 'board' && <BoardView visible={visible} search={search} setSearch={setSearch} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} selectedLane={selectedLane} setSelectedLane={setSelectedLane} day={day} completed={completed} showEditor={showEditor} toggleTask={toggleTask} moveTask={moveTask} archiveTask={archiveTask} duplicateTask={duplicateTask} changeStatus={changeStatus} toggleSubtask={toggleSubtask}/>}
        {view === 'today' && <TodayView board={board} planActions={planActions} day={day} todayTasks={todayTasks} doneToday={doneToday} navigate={navigate} showEditor={showEditor} toggleTask={toggleTask} allTasks={board.tasks} completed={completed} focusIds={board.dailyFocus?.[day] ?? []} onFocus={chooseDailyFocus}/>}
        {view === 'week' && <WeekPlannerView board={board} planActions={planActions} onCapacity={(date,hours,intention)=>setBoard(s=>setWeekCapacity(s,date,hours,intention))} today={day} navigate={navigate} onEdit={showEditor} onInclude={includeInWeek} onFocus={chooseDailyFocus} onReview={saveReview}/>}
        {view === 'calendar' && <CalendarView board={board} planActions={planActions} tasks={board.tasks} completions={board.completions} today={day} onEdit={showEditor} onDuplicate={duplicateTask} onStatus={changeStatus} onReschedule={rescheduleCalendarTask} onTracker={launch => { setTrackerLaunch(launch); navigate('tracker'); }}/>}
        {view === 'upcoming' && <UpcomingView active={active} day={day} completed={completed} showEditor={showEditor} toggleTask={toggleTask}/>}
        {view === 'goals' && <GoalsView goals={goals} showEditor={showEditor}/>}
        {view === 'completed' && <CompletedView board={board} day={day} showEditor={showEditor} navigate={navigate} toggleTask={toggleTask}/>}
        {view === 'archived' && <ArchivedView tasks={board.tasks.filter(t => Boolean(t.archivedAt))} restore={restoreArchived} remove={deleteArchived}/> }
        {view === 'settings' && <SettingsView board={board} setBoard={setBoard} exportData={exportData} importData={importData} reset={reset} fileInputRef={fileInputRef} navigate={navigate} alertNotice={alertNotice}
          account={account} signOut={signOutSafely} showGuide={() => setGuideOpen(true)} importLocal={importFromThisBrowser}/>}
        <footer className="site-footer"><span>Built for your real life <span>✳</span></span><span>{account ? 'Private account sync' : 'Local demo'} · Australia/Brisbane · Version 1.1</span></footer>
      </main>
    </div>
    <WelcomeGuide open={guideOpen} onClose={closeGuide} onBoard={() => navigate('board')} onWeek={() => navigate('week')}/>
    {editor && <TaskModal key={`${editor.task?.id ?? `new-${editor.lane}`}-${editor.date ?? ''}`} task={editor.task} defaultLane={editor.lane} defaultDate={editor.date ?? ''} effectiveStatus={editor.task ? visibleStatus(editor.task, isCompleted(editor.task, board.completions, day)) : undefined} isCopy={editor.isCopy} onDismiss={() => setEditor(null)} onSave={saveTask}/>}
    {notice && <div className="toast" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div></AreasContext.Provider>;
}
