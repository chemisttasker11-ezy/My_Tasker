import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useBoardPersistence } from './hooks/useBoardPersistence';
import { usePlanningController } from './hooks/usePlanningController';
import { createTaskController } from './controllers/taskController';
import { importBoardWithRecovery } from './controllers/backupController';
import { type Category, type Lane, type Priority, type Task, type View, createTask, brisbaneToday, duplicateTask as cloneTask, initialState, isCompleted } from './model';
import { addEntry } from './lib/planning';
import type { ParsedQuickAdd } from './lib/quickAdd';
import { downloadable } from './lib/display';
import { projectBoardSummary } from './lib/boardSummary';
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
import { WeekPlannerView } from './views/WeekPlannerView';
import { LibraryView } from './views/LibraryView';
import { QuotesView } from './views/QuotesView';
import type { TrackerLaunch } from './views/TrackerView';
import { AreasContext } from './lib/areas';
import { addLifeTemplates } from './lib/lifeLibrary';
import { dailyQuote, quoteSettings } from './lib/quotes';
import { relevantTasksForDate } from './lib/planProjection';
import { CheckCircle2, Quote, X } from 'lucide-react';
import { WorkspaceChrome } from './components/WorkspaceChrome';
import { WelcomeGuide } from './components/WelcomeGuide';
import { DraftRecoveryDialog } from './components/DraftRecoveryDialog';
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
  const { board, setBoard, saveError, cloudFailure, cloudRetrying, retryCloudSync, flushBeforeNavigation, loadLegacyBoard,
    recoveryDrafts, serverRevision, restoreDraft, discardDraft, keepServerBoard, downloadDraft, localDraftAvailable } =
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
  const [day, setDay] = useState(brisbaneToday);
  useEffect(() => {
    const refresh = () => setDay(current => {
      const actual = brisbaneToday();
      return actual === current ? current : actual;
    });
    const id = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const [trackerLaunch, setTrackerLaunch] = useState<TrackerLaunch>({ anchor: day, scale: 'day' });
  const { active, completed, todayCopies, todayTasks, doneToday, goals, currentWeekScore } =
    useMemo(() => projectBoardSummary(board, day), [board, day]);
  const visible = useMemo(() => active.filter(t =>
    (categoryFilter === 'All' || t.category === categoryFilter) &&
    (priorityFilter === 'All' || t.priority === priorityFilter) &&
    (!search.trim() || `${t.title} ${t.description} ${t.category}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()))
  ), [active, categoryFilter, priorityFilter, search]);

  useEffect(() => {
    if (categoryFilter !== 'All' && !board.areas.some(a => a.id === categoryFilter)) setCategoryFilter('All');
  }, [board.areas, categoryFilter]);

  function alertNotice(message: string) { setNotice(message); }
  function navigate(next: View) { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function showEditor(task: Task | null, lane: Lane = 'urgent', date = '') { setEditor({ task, lane, date }); }
  function duplicateTask(task: Task) { setEditor({ task: cloneTask(task), lane: task.lane, isCopy: true }); }
  const { planActions, chooseDailyFocus, includeInWeek, saveReview, setCapacity } =
    usePlanningController(board, setBoard, alertNotice);
  const { saveTask, changeStatus, changeCalendarOccurrenceStatus, rescheduleCalendarTask, moveTask,
    archiveTask, restoreArchived, deleteArchived, toggleTask, toggleSubtask } =
    createTaskController(board, setBoard, alertNotice, () => setEditor(null));
  function openDailyTask(task: Task | null, lane: Lane = 'urgent') {
    if (!task) { showEditor(null, lane); return; }
    if (board.plannedEntries.some(entry => entry.id === task.id)) navigate('today');
    else showEditor(task);
  }
  function quickAdd(parsed: ParsedQuickAdd) {
    if (!parsed.title) return;
    setBoard(current => {
      if (current.tasks.length >= 10000) return current;
      const task = createTask({ title: parsed.title, priority: parsed.priority ?? 'medium', category: current.areas[0]?.id ?? 'Personal', lane: 'urgent', dueDate: parsed.due ?? day });
      const next = { ...current, tasks: [...current.tasks, task] };
      return addEntry(next, task.id, parsed.due ?? day);
    });
    alertNotice('Task added to your board and scheduled day');
  }
  function exportData() { downloadable(`my-command-centre-${day}.json`, JSON.stringify(board, null, 2)); alertNotice('Backup downloaded'); }
  function downloadRecoveredDraft(draftId: string) {
    const recovered = downloadDraft(draftId);
    if (!recovered) { alertNotice('This recovery draft was not found.'); return; }
    downloadable(`mytasker-unsynced-${day}.json`, JSON.stringify(recovered, null, 2));
    alertNotice('Recovery draft downloaded; it remains on this device until discarded or synced.');
  }
  function discardRecoveredDraft(draftId: string) {
    if (!window.confirm('Delete this unsynced local copy from this browser? Download it first if you need the work.')) return;
    if (!discardDraft(draftId)) alertNotice('Could not remove this device draft. Browser storage may be unavailable.');
  }
  function restoreRecoveredDraft(draftId: string) {
    if (!restoreDraft(draftId)) alertNotice('The online plan has changed; download your draft for manual reconciliation.');
  }
  async function importData(file: File | undefined) {
    if (!file) return;
    try { await importBoardWithRecovery(file,board,account?.id,setBoard,alertNotice); }
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
    <DraftRecoveryDialog drafts={recoveryDrafts} serverRevision={serverRevision}
      onRestore={restoreRecoveredDraft} onDownload={downloadRecoveredDraft}
      onDiscard={discardRecoveredDraft} onKeepServer={keepServerBoard}/>
    {editor && <TaskModal key={`${editor.task?.id ?? `new-${editor.lane}`}-${editor.date ?? ''}`} task={editor.task} defaultLane={editor.lane} defaultDate={editor.date ?? ''} effectiveStatus={editor.task ? visibleStatus(editor.task, isCompleted(editor.task, board.completions, day)) : undefined} isCopy={editor.isCopy} onDismiss={() => setEditor(null)} onSave={saveTask}/>}
    {notice && <div className="toast" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
      </>}>
        {saveError && <div className="save-warning" role="alert">
          {account ? <>
            <strong>Changes not synced.</strong> {cloudFailure}.
            {localDraftAvailable ? ' A recovery copy is stored in this browser and can be reviewed after signing in again.' : ' Browser recovery is unavailable; keep this page open and export a backup.'}
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
        {view === 'today' && <TodayView board={board} planActions={planActions} day={day} todayTasks={todayTasks} doneToday={doneToday} navigate={navigate} showEditor={openDailyTask} toggleTask={toggleTask} toggleSubtask={toggleSubtask} onQuickAdd={quickAdd} allTasks={[...board.tasks, ...todayCopies]} completed={completed} focusIds={board.dailyFocus?.[day] ?? []} onFocus={chooseDailyFocus}/>}
        {view === 'week' && <WeekPlannerView board={board} planActions={planActions} onCapacity={setCapacity} today={day} navigate={navigate} onEdit={showEditor} onInclude={includeInWeek} onFocus={chooseDailyFocus} onReview={saveReview}/>}
        {view === 'calendar' && <CalendarView board={board} planActions={planActions} tasks={board.tasks} completions={board.completions} today={day} onEdit={showEditor} onDuplicate={duplicateTask} onStatus={changeCalendarOccurrenceStatus} onReschedule={rescheduleCalendarTask} onTracker={launch => { setTrackerLaunch(launch); navigate('tracker'); }}/>}
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
