import { type Dispatch, type SetStateAction, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, CalendarDays, CalendarRange, BarChart3, Check, CheckCircle2, ChevronRight, LayoutDashboard, ListTodo, Menu, Moon, Plus, Settings2, Sparkles, Sun, Target, X } from 'lucide-react';
import { type BoardState, type Category, type Lane, type Priority, type Task, type TaskStatus, type View, STORAGE_KEY, periodKey, brisbaneToday, duplicateTask as cloneTask, initialState, isCompleted, moveInBoard, loadBoard, preserveRaw, writeBoard, rescheduleTask, saveTaskChanges, saveWeekReview, setTaskStatus, setWeekCommitment, toggleCompletion, toggleDailyFocus, validateImported } from './model';
import { activeItem, downloadable, LANE_LABEL, longToday } from './lib/display';
import { RecoveryScreen, OnboardingCard } from './components/BoardSafety';
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
import { LibraryView } from './views/LibraryView';
import { QuotesView } from './views/QuotesView';
import type { TrackerLaunch } from './views/TrackerView';
import { AreasContext } from './lib/areas';
import { addLifeTemplates } from './lib/lifeLibrary';
import { dailyQuote, quoteSettings } from './lib/quotes';
import { Library, Quote, Printer } from 'lucide-react';
const TrackerView = lazy(() => import('./views/TrackerView').then(module => ({ default: module.TrackerView })));

const ICONS = { overview: LayoutDashboard, board: ListTodo, today: Sun, week: BarChart3, calendar: CalendarRange, upcoming: CalendarDays, goals: Target, completed: CheckCircle2, archived: Archive, settings: Settings2, library: Library, quotes: Quote, tracker: Printer };
const NAV: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'board', label: 'My task board' },
  { id: 'today', label: 'Today' }, { id: 'week', label: 'Week planner' }, { id: 'calendar', label: 'Calendar' }, { id: 'upcoming', label: 'Upcoming' },
  { id: 'goals', label: 'Long-term goals' }, { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived tasks' }, { id: 'library', label: 'Life task library' }, { id: 'tracker', label: 'Printable tracker' }, { id: 'quotes', label: 'Direction & quotes' }
];

export default function App() {
  const [loaded] = useState(loadBoard);
  const [board, updateBoard] = useState<BoardState>(loaded.board);
  const boardRef = useRef(board);
  const rawRef = useRef(loaded.raw);
  const [conflictBackup, setConflictBackup] = useState('');
  const dirtyRef = useRef(false);
  const [recovery, setRecovery] = useState(loaded.recovery);
  const recoveryRef = useRef(loaded.recovery);
  const queue = useRef(Promise.resolve());
  const externalRevision = useRef(0);
  const setBoard: Dispatch<SetStateAction<BoardState>> = action => {
    const observedRevision = externalRevision.current;
    queue.current = queue.current.then(async () => {
      const apply = () => {
        if (recoveryRef.current) return;
        if (observedRevision !== externalRevision.current) { setNotice('Another tab changed the board; this change was not applied.'); return; }
        const current = boardRef.current;
        const next = typeof action === 'function' ? action(current) : action;
        if (next === current) { setNotice('No change was saved. The selection may be unavailable or a board limit has been reached.'); return; }
        try {
          const warnings: string[] = [];
          try { validateImported(next, warnings); } catch (err) { setNotice(err instanceof Error ? err.message : 'Invalid change'); return; }
          if (warnings.length) { setNotice(`Change not saved: ${warnings.join(' ')}`); return; }
          const saved = writeBoard(rawRef.current, next);
          dirtyRef.current = false; rawRef.current = saved.raw; boardRef.current = saved.board; updateBoard(saved.board); setSaveError(false);
        } catch (error) {
          if (error instanceof Error && error.message === 'conflict') {
            const incoming = loadBoard();
            setConflictBackup(JSON.stringify(next, null, 2));
            rawRef.current = incoming.raw;
            dirtyRef.current = false;
            externalRevision.current++;
            if (incoming.recovery) { recoveryRef.current = incoming.recovery; setRecovery(incoming.recovery); }
            else { rawRef.current = incoming.raw; boardRef.current = incoming.board; updateBoard(incoming.board); }
            setNotice('Another tab changed this board. The newer board was loaded; your attempted change was not applied.');
          } else {
            dirtyRef.current = true; boardRef.current = next; updateBoard(next); setSaveError(true);
          }
        }
      };
      if (navigator.locks) await navigator.locks.request(STORAGE_KEY, apply);
      else apply();
    }).catch(() => { setSaveError(true); setNotice('The save could not complete. Download your data before leaving.'); });
  };
  const [view, setView] = useState<View>('overview');
  const [selectedLane, setSelectedLane] = useState<Lane>('urgent');
  const [editor, setEditor] = useState<{ task: Task | null; lane: Lane; date?: string; isCopy?: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'All'>('All');
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState(loaded.warning ?? '');
  const [saveError, setSaveError] = useState(loaded.storageError ?? false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [day, setDay] = useState(brisbaneToday);
  useEffect(() => {
    const refresh = () => setDay(brisbaneToday());
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const [trackerLaunch, setTrackerLaunch] = useState<TrackerLaunch>({ anchor: day, scale: 'day' });
  const active = useMemo(() => board.tasks.filter(activeItem), [board.tasks]);
  const completedPeriods = useMemo(() => new Set(board.completions.map(c => `${c.taskId}:${c.periodKey}`)), [board.completions]);
  const completed = (task: Task) => task.recurrence === 'none' ? Boolean(task.completedAt) : completedPeriods.has(`${task.id}:${periodKey(task.recurrence, day)}`);
  const visible = useMemo(() => active.filter(t =>
    (categoryFilter === 'All' || t.category === categoryFilter) &&
    (priorityFilter === 'All' || t.priority === priorityFilter) &&
    (!search.trim() || `${t.title} ${t.description} ${t.category}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()))
  ), [active, categoryFilter, priorityFilter, search]);
  const outstanding = active.filter(t => !completed(t));
  const todayTasks = outstanding.filter(t => (t.status !== 'postponed' || Boolean(t.dueDate && t.dueDate <= day)) && (t.lane === 'daily' || t.lane === 'urgent' || (t.dueDate && t.dueDate <= day)));
  const doneToday = useMemo(() => board.completions.filter(c => brisbaneToday(new Date(c.completedAt)) === day).length, [board.completions, day]);
  const goals = active.filter(t => t.lane === 'goals');
  const currentWeekStart = mondayOf(day);
  const currentWeekScore = useMemo(() => scoreWeek(board.weekPlans?.[currentWeekStart], board, currentWeekStart, day), [board, currentWeekStart, day]);

  useEffect(() => { document.documentElement.dataset.theme = board.theme; }, [board.theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || event.newValue === rawRef.current) return;
      // A failed local write stays available for export until the user makes another edit.
      if (dirtyRef.current) {
        setNotice('Another tab changed the saved board. Your unsaved work is still here; download a backup before editing again.');
        return;
      }
      const incoming = loadBoard();
      externalRevision.current++;
      rawRef.current = incoming.raw;
      if (incoming.recovery) { recoveryRef.current = incoming.recovery; setRecovery(incoming.recovery); }
      else { rawRef.current = incoming.raw; boardRef.current = incoming.board; updateBoard(incoming.board); setNotice('Updated board loaded from another tab.'); }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    if (categoryFilter !== 'All' && !board.areas.some(a => a.id === categoryFilter)) setCategoryFilter('All');
  }, [board.areas, categoryFilter]);

  function alertNotice(message: string) { setNotice(message); }
  function navigate(next: View) { setView(next); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function showEditor(task: Task | null, lane: Lane = 'urgent', date = '') { setEditor({ task, lane, date }); }
  function duplicateTask(task: Task) { setEditor({ task: cloneTask(task), lane: task.lane, isCopy: true }); }
  function saveTask(task: Task) {
    const warnings: string[] = [];
    try { validateImported({ ...board, tasks: board.tasks.some(t => t.id === task.id) ? board.tasks.map(t => t.id === task.id ? task : t) : [...board.tasks, task] }, warnings); }
    catch (err) { alertNotice(err instanceof Error ? err.message : 'Task could not be saved'); return; }
    if (warnings.length) { alertNotice('Task could not be saved: ' + warnings.join(' ')); return; }
    setBoard(s => saveTaskChanges(s, task));
    setEditor(null); alertNotice('Task saved');
  }
  function changeStatus(id: string, status: TaskStatus, postponedTo?: string) {
    setBoard(s => setTaskStatus(s, id, status, postponedTo));
    alertNotice(status === 'postponed' ? 'Task postponed to its new date' : `Status updated`);
  }
  function includeInWeek(weekStart: string, id: string, include: boolean) {
    const task = board.tasks.find(item => item.id === id);
    if (!task && include) return;
    setBoard(state => setWeekCommitment(state, weekStart, task ?? { id, title: '', priority: 'medium', dueDate: '' }, include));
    alertNotice(include ? 'Added to weekly commitments' : 'Removed from weekly commitments');
  }
  function chooseDailyFocus(date: string, id: string) {
    const selected = (board.dailyFocus?.[date] ?? []).filter(id => board.tasks.some(t => t.id === id && !t.archivedAt));
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
      const warnings: string[] = [];
      const incoming = validateImported(JSON.parse(await file.text()), warnings);
      if (!window.confirm(`Import ${incoming.tasks.length} tasks, ${incoming.areas.length} areas and ${incoming.completions.length} history entries? This replaces your board. A backup will be saved first. ${warnings.join(' ')}`)) return;
      try { preserveRaw(JSON.stringify(boardRef.current), 'backup'); } catch { setSaveError(true); alertNotice('Backup could not be saved. Import cancelled.'); return; }
      setBoard(incoming); alertNotice('Backup restored');
    } catch (err) { if (err instanceof DOMException) setSaveError(true); alertNotice(err instanceof Error ? err.message : 'Could not import backup'); }
    finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
  }
  function reset() {
    if (!window.confirm('Start with an empty board? Your current board will be backed up first.')) return;
    try { preserveRaw(JSON.stringify(boardRef.current), 'backup'); } catch { setSaveError(true); return; }
    setBoard(initialState()); navigate('overview'); alertNotice('Empty board created');
  }
  const selectedNav = NAV.find(n => n.id === view);
  const reminder = dailyQuote(board.quotes, day, todayTasks);
  function addTemplates(ids: string[]) {
    setBoard(current => addLifeTemplates(current, ids));
    alertNotice('Life tasks added with notes and checklists. Set dates whenever you are ready.');
  }

  if (recovery) return <RecoveryScreen message={recovery} raw={rawRef.current ?? ''} storageError={saveError} onReplace={async next => {
    const replace = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== rawRef.current) {
        const incoming = loadBoard(); rawRef.current = incoming.raw;
        if (!incoming.recovery) { boardRef.current = incoming.board; updateBoard(incoming.board); recoveryRef.current = undefined; setRecovery(undefined); setNotice('Another tab restored the board. Your replacement was not applied.'); return; }
      }
      if (raw !== null) preserveRaw(raw, 'recovery');
      rawRef.current = raw;
      // Replacement is explicitly confirmed by the recovery screen.
      const revised = { ...next, revision: 0 };
      const encoded = JSON.stringify(revised);
      localStorage.setItem(STORAGE_KEY, encoded);
      rawRef.current = encoded; boardRef.current = revised; updateBoard(revised);
      recoveryRef.current = undefined; setRecovery(undefined); setSaveError(false);
    } catch { setSaveError(true); }
    };
    if (navigator.locks) await navigator.locks.request(STORAGE_KEY, replace); else replace();
  }}/>;

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
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open menu" aria-controls="main-navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Menu size={23}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{view === 'board' ? 'Task board' : view === 'settings' ? 'Settings' : selectedNav?.label}</strong></div></div><div className="topbar-right"><span className="date-chip"><CalendarDays size={16}/>{longToday(day)}</span><button className="icon-button theme-toggle" aria-label="Toggle light or dark theme" onClick={() => setBoard(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))}>{board.theme === 'light' ? <Moon size={19}/> : <Sun size={19}/>}</button><button className="top-add" onClick={() => showEditor(null, 'urgent')}><Plus size={18}/> <span>New task</span></button></div></header>
      <main className="content" id="main-content" tabIndex={-1}>
        {conflictBackup && <div className="save-warning" role="status">An edit was not applied after a conflict. <button className="button button-secondary" onClick={() => downloadable('my-command-centre-unapplied.json', conflictBackup)}>Download unapplied changes</button><button className="button button-secondary" onClick={() => setConflictBackup('')}>Dismiss</button></div>}
        {saveError && <div className="save-warning" role="alert">Browser storage is unavailable or full. Export your work before leaving this page.</div>}
        {(view === 'overview' || view === 'today') && <section className="direction-banner" aria-label="Daily inspiration"><div><span>MY DIRECTION</span><p>{quoteSettings(board.quotes).direction || 'Choose a reminder of what matters to you.'}</p></div><div><span>TODAY’S REMINDER</span><p>{reminder.text}</p></div><button className="icon-button" aria-label="Edit direction and quotes" onClick={() => navigate('quotes')}><Quote size={18}/></button></section>}
        {board.onboardingStep && <OnboardingCard step={board.onboardingStep} onStep={step => setBoard(s => ({ ...s, onboardingStep: step }))} onLibrary={() => { setBoard(s => ({ ...s, onboardingStep: undefined })); navigate('library'); }}/> }
        {view === 'library' && <LibraryView tasks={board.tasks} onAdd={addTemplates}/>}
        {view === 'quotes' && <QuotesView value={board.quotes} today={day} tasks={todayTasks} onChange={quotes => setBoard(current => ({ ...current, quotes }))}/>}
        {view === 'tracker' && <Suspense fallback={<p role="status">Loading your tracker…</p>}><TrackerView board={board} launch={trackerLaunch}/></Suspense>}
        {view === 'overview' && <OverviewView active={active} todayTasks={todayTasks} doneToday={doneToday} goals={goals} navigate={navigate} showEditor={showEditor} toggleTask={toggleTask} setSelectedLane={setSelectedLane} weekScore={currentWeekScore} scoreEnabled={board.weeklyScoreEnabled ?? false}/>}
        {view === 'board' && <BoardView visible={visible} search={search} setSearch={setSearch} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} selectedLane={selectedLane} setSelectedLane={setSelectedLane} day={day} completed={completed} showEditor={showEditor} toggleTask={toggleTask} moveTask={moveTask} archiveTask={archiveTask} duplicateTask={duplicateTask} changeStatus={changeStatus} toggleSubtask={toggleSubtask}/>}
        {view === 'today' && <TodayView scoreEnabled={board.weeklyScoreEnabled ?? false} day={day} todayTasks={todayTasks} doneToday={doneToday} navigate={navigate} showEditor={showEditor} toggleTask={toggleTask} allTasks={board.tasks} completed={completed} focusIds={board.dailyFocus?.[day] ?? []} onFocus={chooseDailyFocus}/>}
        {view === 'week' && <WeekPlannerView board={board} today={day} navigate={navigate} onEdit={showEditor} onInclude={includeInWeek} onFocus={chooseDailyFocus} onReview={saveReview}/>}
        {view === 'calendar' && <CalendarView tasks={board.tasks} completions={board.completions} today={day} onEdit={showEditor} onDuplicate={duplicateTask} onStatus={changeStatus} onReschedule={rescheduleCalendarTask} onTracker={launch => { setTrackerLaunch(launch); navigate('tracker'); }}/>}
        {view === 'upcoming' && <UpcomingView active={active} day={day} completed={completed} showEditor={showEditor} toggleTask={toggleTask}/>}
        {view === 'goals' && <GoalsView goals={goals} showEditor={showEditor}/>}
        {view === 'completed' && <CompletedView board={board} day={day} showEditor={showEditor} navigate={navigate} toggleTask={toggleTask}/>}
        {view === 'archived' && <ArchivedView tasks={board.tasks.filter(t => Boolean(t.archivedAt))} restore={restoreArchived} remove={deleteArchived}/> }
        {view === 'settings' && <SettingsView board={board} setBoard={setBoard} exportData={exportData} importData={importData} reset={reset} fileInputRef={fileInputRef} navigate={navigate} alertNotice={alertNotice}/>}
        <footer className="site-footer"><span>Built for your real life <span>✳</span></span><span>Local-first · Australia/Brisbane · Version 1.0</span></footer>
      </main>
    </div>
    {editor && <TaskModal key={`${editor.task?.id ?? `new-${editor.lane}`}-${editor.date ?? ''}`} task={editor.task} defaultLane={editor.lane} defaultDate={editor.date ?? ''} effectiveStatus={editor.task ? visibleStatus(editor.task, isCompleted(editor.task, board.completions, day)) : undefined} isCopy={editor.isCopy} onDismiss={() => setEditor(null)} onSave={saveTask}/>}
    {notice && <div className="toast" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div></AreasContext.Provider>;
}
