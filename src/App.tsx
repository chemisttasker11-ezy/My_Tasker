import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useBoardPersistence } from './hooks/useBoardPersistence';
import { usePlanningController } from './hooks/usePlanningController';
import { type Category, type Lane, type Priority, type Task, type TaskStatus, type View, brisbaneToday, duplicateTask as cloneTask, initialState, isCompleted, moveInBoard, rescheduleTask, saveTaskChanges, setTaskStatus, toggleCompletion, validateImported } from './model';
import { activeItem, downloadable, LANE_LABEL } from './lib/display';
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
import { editEntry } from './lib/planning';
import { LibraryView } from './views/LibraryView';
import { QuotesView } from './views/QuotesView';
import type { TrackerLaunch } from './views/TrackerView';
import { AreasContext } from './lib/areas';
import { addLifeTemplates } from './lib/lifeLibrary';
import { dailyQuote, quoteSettings } from './lib/quotes';
import { projectSchedule, taskForPlanned, relevantTasksForDate } from './lib/planProjection';
import { CheckCircle2, Quote, X } from 'lucide-react';
import { WorkspaceChrome } from './components/WorkspaceChrome';
import { WelcomeGuide } from './components/WelcomeGuide';
import { sampleBoard } from './lib/sampleBoard';
import type { CloudSnapshot, SignedInUser } from './lib/authApi';
const TrackerView = lazy(() => import('./views/TrackerView').then(module => ({ default: module.TrackerView })));

interface AppProps {
  account?: SignedInUser;
  initialCloud?: CloudSnapshot;
  onSignOut?: () => Promise<void>;
  onAdminReturn?: () => void;
}
export default function App({ account, initialCloud, onSignOut, onAdminReturn }: AppProps = {}) {
  const { board, setBoard, saveError, cloudFailure, cloudRetrying, retryCloudSync, flushBeforeNavigation, loadLegacyBoard } =
    useBoardPersistence(account, initialCloud);
  const guideKey = account ? `mytasker-guide:${account.id}` : '';
  const [guideOpen, setGuideOpen] = useState(() => Boolean(account && !localStorage.getItem(guideKey)));
  const closeGuide = () => { setGuideOpen(false); if (guideKey) localStorage.setItem(guideKey,'seen'); };
  const [view, setView] = useState<View>('overview');
  const [selectedLane, setSelectedLane] = useState<Lane>('urgent');
  const [editor, setEditor] = useState<{ task: Task | null; lane: Lane; date?: string; isCopy?: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'All'>('All');
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const day = brisbaneToday();
  const [trackerLaunch, setTrackerLaunch] = useState<TrackerLaunch>({ anchor: day, scale: 'day' });
  const active = useMemo(() => board.tasks.filter(activeItem), [board.tasks]);
  const completed = (task: Task) => {
    const entry = board.plannedEntries.find(e => e.id === task.id);
    return entry ? entry.status === 'finished' : isCompleted(task, board.completions, day);
  };
  const visible = useMemo(() => active.filter(t =>
    (categoryFilter === 'All' || t.category === categoryFilter) &&
    (priorityFilter === 'All' || t.priority === priorityFilter) &&
    (!search.trim() || `${t.title} ${t.description} ${t.category}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()))
  ), [active, categoryFilter, priorityFilter, search]);
  const todaySchedule = useMemo(() => projectSchedule(board, day, day), [board, day]);
  const todayCopies = todaySchedule.planned.map(entry => taskForPlanned(entry, board.tasks.find(t => t.id === entry.sourceTaskId)));
  const scheduledSourceIds = new Set(todaySchedule.planned.map(entry => entry.sourceTaskId));
  const outstanding = active.filter(t => !completed(t) && !scheduledSourceIds.has(t.id));
  const todayLegacy = outstanding.filter(t => t.status !== 'postponed' &&
    (t.lane === 'daily' || t.lane === 'urgent' || (t.dueDate && t.dueDate <= day)));
  const todayTasks = [...todayCopies.filter(t => t.status !== 'postponed'), ...todayLegacy];
  const dayDoneHistory = board.completions.filter(c => brisbaneToday(new Date(c.completedAt)) === day).length;
  const doneToday = dayDoneHistory + board.plannedEntries.filter(entry => entry.date === day && entry.status === 'finished').length;
  const goals = active.filter(t => t.lane === 'goals');
  const currentWeekStart = mondayOf(day);
  const currentWeekScore = useMemo(() => scoreWeek(board.weekPlans?.[currentWeekStart], board, currentWeekStart, day), [board, currentWeekStart, day]);

  useEffect(() => {
    if (categoryFilter !== 'All' && !board.areas.some(a => a.id === categoryFilter)) setCategoryFilter('All');
  }, [board.areas, categoryFilter]);

  function alertNotice(message: string) { setNotice(message); }
  function navigate(next: View) { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
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
  const { planActions, chooseDailyFocus, includeInWeek, saveReview, setCapacity } =
    usePlanningController(board, setBoard, alertNotice);
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
    setBoard(s => {
      const planned = s.plannedEntries.find(e => e.id === id);
      return planned ? editEntry(s, id, { status: planned.status === 'finished' ? 'not-started' : 'finished' }) : toggleCompletion(s, id);
    });
    alertNotice('Progress updated');
  }
  function openDailyTask(task: Task | null, lane: Lane = 'urgent') {
    if (!task) { showEditor(null, lane); return; }
    if (board.plannedEntries.some(entry => entry.id === task.id)) navigate('today');
    else showEditor(task);
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
    if (!await flushBeforeNavigation()) {
      alertNotice('Cloud save failed. Export a backup before signing out.');
      return;
    }
    try { await afterSave(); }
    catch (error) { alertNotice(error instanceof Error ? error.message : 'Unable to leave safely.'); }
  }
  async function signOutSafely() { if (onSignOut) await leaveSafely(onSignOut); }
  async function returnToAdmin() { if (onAdminReturn) await leaveSafely(onAdminReturn); }
  async function retryCloudSyncWithFeedback() {
    if (await retryCloudSync()) alertNotice('Your latest planner changes were saved securely.');
  }
  function importFromThisBrowser() {
    try {
      const restored = loadLegacyBoard();
      if (!restored) { alertNotice('No earlier local task board was found.'); return; }
      if (!window.confirm('Replace your signed-in board with tasks saved in this browser? This will sync them to your account.')) return;
      setBoard(restored);
      alertNotice('Imported local tasks into your private account.');
    } catch (error) { alertNotice(error instanceof Error ? error.message : 'Could not read the local board.'); }
  }
  const reminder = dailyQuote(board.quotes, day, relevantTasksForDate(board,day));
  function addTemplates(ids: string[]) {
    setBoard(current => addLifeTemplates(current, ids));
    alertNotice('Life tasks added with notes and checklists. Set dates whenever you are ready.');
  }

  return <AreasContext.Provider value={board.areas}>
    <WorkspaceChrome view={view} day={day} theme={board.theme}
      todayCount={todayTasks.length} goalsCount={goals.length} accountEmail={account?.email}
      onNavigate={navigate} onThemeToggle={()=>setBoard(s=>({...s,theme:s.theme==='light'?'dark':'light'}))}
      onNewTask={()=>showEditor(null,'urgent')} onGuide={account?()=>setGuideOpen(true):undefined}
      onSignOut={account?()=>void signOutSafely():undefined}
      onAdminReturn={onAdminReturn?()=>void returnToAdmin():undefined}
      overlays={<>
    <WelcomeGuide open={guideOpen} onClose={closeGuide} onBoard={() => navigate('board')} onWeek={() => navigate('week')}/>
    {editor && <TaskModal key={`${editor.task?.id ?? `new-${editor.lane}`}-${editor.date ?? ''}`} task={editor.task} defaultLane={editor.lane} defaultDate={editor.date ?? ''} effectiveStatus={editor.task ? visibleStatus(editor.task, isCompleted(editor.task, board.completions, day)) : undefined} isCopy={editor.isCopy} onDismiss={() => setEditor(null)} onSave={saveTask}/>}
    {notice && <div className="toast" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
      </>}>
        {saveError && <div className="save-warning" role="alert">
          {account ? <>
            <strong>Changes not synced.</strong> {cloudFailure}. Your edits are still on this page; export a backup before closing it.
            <div className="cloud-recovery-actions">
              <button className="button button-secondary" disabled={cloudRetrying} onClick={()=>void retryCloudSyncWithFeedback()}>{cloudRetrying?'Retrying…':'Retry cloud sync'}</button>
              <button className="button button-secondary" onClick={exportData}>Download local backup</button>
            </div>
          </> : 'Browser storage is unavailable or full. Export your work before leaving this page.'}</div>}
        {view !== 'tracker' && view !== 'quotes' && <section className="direction-banner" aria-label="Daily inspiration"><div><span>MY DIRECTION</span><p>{quoteSettings(board.quotes).direction || 'Choose a reminder of what matters to you.'}</p></div><div><span>TODAY’S REMINDER</span><p>{reminder.text}</p></div><button className="icon-button" aria-label="Edit direction and quotes" onClick={() => navigate('quotes')}><Quote size={18}/></button></section>}
        {view === 'library' && <LibraryView tasks={board.tasks} onAdd={addTemplates}/>}
        {view === 'quotes' && <QuotesView value={board.quotes} today={day} board={board} onChange={quotes => setBoard(current => ({ ...current, quotes }))}/>}
        {view === 'tracker' && <Suspense fallback={<p role="status">Loading your tracker…</p>}><TrackerView board={board} launch={trackerLaunch}/></Suspense>}
        {view === 'overview' && <OverviewView active={active} todayTasks={todayTasks} doneToday={doneToday} goals={goals} navigate={navigate} showEditor={openDailyTask} completed={completed} toggleTask={toggleTask} setSelectedLane={setSelectedLane} weekScore={currentWeekScore}/>}
        {view === 'board' && <BoardView visible={visible} search={search} setSearch={setSearch} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} selectedLane={selectedLane} setSelectedLane={setSelectedLane} day={day} completed={completed} showEditor={showEditor} toggleTask={toggleTask} moveTask={moveTask} archiveTask={archiveTask} duplicateTask={duplicateTask} changeStatus={changeStatus} toggleSubtask={toggleSubtask}/>}
        {view === 'today' && <TodayView board={board} planActions={planActions} day={day} todayTasks={todayTasks} doneToday={doneToday} navigate={navigate} showEditor={openDailyTask} toggleTask={toggleTask} allTasks={[...board.tasks, ...todayCopies]} completed={completed} focusIds={board.dailyFocus?.[day] ?? []} onFocus={chooseDailyFocus}/>}
        {view === 'week' && <WeekPlannerView board={board} planActions={planActions} onCapacity={setCapacity} today={day} navigate={navigate} onEdit={showEditor} onInclude={includeInWeek} onFocus={chooseDailyFocus} onReview={saveReview}/>}
        {view === 'calendar' && <CalendarView board={board} planActions={planActions} tasks={board.tasks} completions={board.completions} today={day} onEdit={showEditor} onDuplicate={duplicateTask} onStatus={changeStatus} onReschedule={rescheduleCalendarTask} onTracker={launch => { setTrackerLaunch(launch); navigate('tracker'); }}/>}
        {view === 'upcoming' && <UpcomingView active={active} day={day} completed={completed} showEditor={showEditor} toggleTask={toggleTask}/>}
        {view === 'goals' && <GoalsView goals={goals} showEditor={showEditor}/>}
        {view === 'completed' && <CompletedView board={board} day={day} showEditor={showEditor} navigate={navigate} toggleTask={toggleTask}/>}
        {view === 'archived' && <ArchivedView tasks={board.tasks.filter(t => Boolean(t.archivedAt))} restore={restoreArchived} remove={deleteArchived}/> }
        {view === 'settings' && <SettingsView board={board} setBoard={setBoard} exportData={exportData} importData={importData} reset={reset} fileInputRef={fileInputRef} navigate={navigate} alertNotice={alertNotice}
          account={account} signOut={signOutSafely} showGuide={() => setGuideOpen(true)} importLocal={importFromThisBrowser}/>}
        <footer className="site-footer"><span>Built for your real life <span>✳</span></span><span>{account ? 'Private account sync' : 'Local demo'} · Australia/Brisbane · Version 1.1</span></footer>
    </WorkspaceChrome>
  </AreasContext.Provider>;
}
