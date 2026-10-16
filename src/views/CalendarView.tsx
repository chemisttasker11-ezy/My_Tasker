import { useAreas } from '../lib/areas';
import type { TrackerLaunch } from './TrackerView';
import { useMemo, useState, type DragEvent } from 'react';
import { PlanWorkspace, type PlanningActions } from '../components/PlanWorkspace';
import type { BoardState } from '../model';
import { CalendarDays, Plus, Search, X } from 'lucide-react';
import { CalendarHeader } from '../components/calendar/CalendarHeader';
import { CalendarPlannerDialogs } from '../components/calendar/CalendarPlannerDialogs';
import { type Category, type Completion, type Lane, type Task, type TaskStatus } from '../model';
import { addDays, dateTitle, dateUTC, monthDates, shiftCalendar, visibleRange, type CalendarScale, type CalendarOccurrence } from '../lib/calendar';
import { formatDate } from '../lib/display';
import { CalendarEntry } from '../components/CalendarEntry';
import { STATUS_LABEL, STATUS_ORDER, visibleStatus } from '../lib/progress';
import { projectSchedule } from '../lib/planProjection';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

interface Props {
  board: BoardState; planActions: PlanningActions;
  onTracker: (launch: TrackerLaunch) => void;
  tasks: Task[];
  completions: Completion[];
  today: string;
  onEdit: (task: Task | null, lane?: Lane, defaultDate?: string) => void;
  onDuplicate: (task: Task) => void;
  onStatus: (id: string, status: TaskStatus, postponedTo?: string) => void;
  onReschedule: (id: string, date: string) => void;
}

/** Task data lives in the domain model. The calendar only renders occurrences. */
export function CalendarView({ board, planActions, tasks, today, onEdit, onDuplicate, onStatus, onReschedule, onTracker }: Props) {
  const areas = useAreas();
  const [scale, setScale] = useState<CalendarScale>('month');
  const [planningDay, setPlanningDay] = useState<string | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [extraDate, setExtraDate] = useState(today);
  const [anchor, setAnchor] = useState(today);
  const [category, setCategory] = useState<Category | 'All'>('All');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => tasks.filter(t => !t.archivedAt &&
    (category === 'All' || t.category === category) &&
    (!search.trim() || `${t.title} ${t.description} ${t.category}`.toLowerCase().includes(search.trim().toLowerCase()))
  ), [tasks, category, search]);
  const range = visibleRange(anchor, scale);
  const occurrences = useMemo(() => projectSchedule(board, range.start, range.end, category, filtered).legacy, [board, filtered, range.start, range.end, category]);
  const byDay = useMemo(() => {
    const result = new Map<string, CalendarOccurrence[]>();
    for (const occurrence of occurrences) result.set(occurrence.date, [...result.get(occurrence.date) ?? [], occurrence]);
    return result;
  }, [occurrences]);
  const plannedByDay = board.plannedEntries.filter(e => (category === 'All' || e.category === category) && (!search.trim() || `${e.title} ${e.description} ${e.category}`.toLowerCase().includes(search.trim().toLowerCase())));
  const unscheduled = filtered.filter(task => !task.dueDate && !task.completedAt);
  const addAt = (date: string) => onEdit(null, 'urgent', date);
  const edit = (task: Task) => onEdit(task);
  const unschedule = (task: Task) => onReschedule(task.id, '');
  const entry = (occurrence: CalendarOccurrence, compact = false) => <CalendarEntry key={`${occurrence.task.id}-${occurrence.date}`} occurrence={occurrence} compact={compact}
    onEdit={edit} onDuplicate={onDuplicate} onStatus={onStatus} onUnschedule={unschedule}/>;
  function dropTask(event: DragEvent<HTMLElement>, date: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (filtered.some(task => task.id === id)) onReschedule(id, date);
  }
  function dropProps(date: string) {
    return { onDragOver: (event: DragEvent<HTMLElement>) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; },
      onDrop: (event: DragEvent<HTMLElement>) => dropTask(event, date) };
  }
  function openDay(date: string) { setPlanningDay(date); }
  const dayEntries = byDay.get(anchor) ?? [];
  const plannedOnDay = plannedByDay.filter(e => e.date === anchor);
  const withTime = dayEntries.filter(item => item.task.scheduledTime);
  const anytime = dayEntries.filter(item => !item.task.scheduledTime);
  const otherHours = withTime.filter(item => { const h = Number(item.task.scheduledTime.slice(0, 2)); return h < 6 || h > 22; });

  return <>
    <CalendarPlannerDialogs board={board} planActions={planActions} selectionOpen={selectionOpen}
      selectedDates={selectedDates} extraDate={extraDate} anchor={anchor} planningDay={planningDay}
      onCloseSelection={()=>setSelectionOpen(false)} onCloseDay={()=>setPlanningDay(null)}
      onSetExtraDate={setExtraDate} onIncludeDate={date=>setSelectedDates(s=>[...s,date].sort())}
      onRemoveDate={date=>setSelectedDates(s=>s.filter(d=>d!==date))}/>
    <CalendarHeader anchor={anchor} scale={scale} today={today} onOpenDay={openDay}
      onOpenTracker={()=>onTracker({anchor,scale,area:category})}
      onCopyDays={()=>{setSelectedDates([anchor]);setExtraDate(anchor);setSelectionOpen(true);}}
      onShift={direction=>setAnchor(value=>shiftCalendar(value,scale,direction))}
      onToday={()=>setAnchor(today)} onScale={setScale}/>
    <div className="calendar-filter-row">
      <label className="calendar-filter"><Search size={16}/><input aria-label="Search calendar tasks" placeholder="Find a scheduled task" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="Clear calendar search" onClick={() => setSearch('')}><X size={15}/></button>}</label>
      <label className="calendar-filter-select">Area <select aria-label="Calendar category" value={category} onChange={e => setCategory(e.target.value as Category | 'All')}><option value="All">All areas</option>{areas.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}</select></label>
      <span className="calendar-count">{occurrences.length} scheduled {occurrences.length === 1 ? 'occurrence' : 'occurrences'} shown</span>
    </div>
    <div className="calendar-legend" aria-label="Task status legend">{STATUS_ORDER.map(status => <span key={status}><span className={`calendar-status-dot status-${status}`}/>{STATUS_LABEL[status]}</span>)}</div>
    <div className="calendar-layout">
      <div className="calendar-main">
        {scale === 'day' && <section className="panel calendar-day">
          <div className="calendar-day-heading"><CalendarDays size={19}/><h3>{dateTitle(anchor, 'day')}</h3><button type="button" className="button button-secondary" onClick={() => openDay(anchor)}><Plus size={15}/> Plan day</button></div>
          <div className="calendar-anytime" {...dropProps(anchor)}><h3>Anytime</h3>
            {plannedOnDay.filter(e=>!e.scheduledTime).map(e=><button key={e.id} type="button" className="calendar-chip plan-calendar-chip" onClick={()=>openDay(anchor)}>{e.title} · {e.status}</button>)}
            {anytime.length ? anytime.map(item => entry(item)) : !plannedOnDay.some(e=>!e.scheduledTime) && <p>Nothing scheduled without a time. Open the day planner to add a copy.</p>}</div>
          <div className="calendar-hours">{HOURS.map(hour => <div key={hour} className="calendar-hour" {...dropProps(anchor)}>
            <div className="calendar-hour-label">{String(hour).padStart(2, '0')}:00</div>
            <div className="calendar-hour-body">
              {plannedOnDay.filter(e=>e.scheduledTime && Number(e.scheduledTime.slice(0,2)) === hour).map(e=><button key={e.id} className="calendar-chip plan-calendar-chip" onClick={()=>openDay(anchor)}>{e.scheduledTime} · {e.title}</button>)}
              {withTime.filter(item => Number(item.task.scheduledTime.slice(0, 2)) === hour).map(item => entry(item))}</div>
          </div>)}{otherHours.length > 0 && <div className="calendar-hour"><div className="calendar-hour-label">Other</div><div className="calendar-hour-body">{otherHours.map(item => entry(item))}</div></div>}</div>
        </section>}
        {scale === 'week' && <div className="calendar-week-scroller"><div className="calendar-week" role="grid" aria-label="Weekly calendar">
          {Array.from({ length: 7 }, (_, i) => addDays(range.start, i)).map(date => <section className={`calendar-week-day ${date === today ? 'is-today' : ''}`} key={date} data-testid={`calendar-date-${date}`} {...dropProps(date)}>
            <div className="calendar-week-heading"><button onClick={() => openDay(date)}><span>{WEEKDAYS[(dateUTC(date).getUTCDay() + 6) % 7]}</span><strong>{date.slice(-2)}</strong></button><button aria-label={`Add task on ${date}`} onClick={() => openDay(date)}><Plus size={15}/></button></div>
            <div className="calendar-week-items">{plannedByDay.filter(e=>e.date===date).map(e=><button key={e.id} type="button" className="calendar-chip plan-calendar-chip" onClick={()=>openDay(date)}>{e.title} · {e.status}</button>)}{(byDay.get(date) ?? []).map(item => entry(item))}{!(byDay.get(date)?.length) && !plannedByDay.some(e=>e.date===date) && <p className="calendar-week-empty">Drop a task or add one</p>}</div>
          </section>)}
        </div></div>}
        {scale === 'month' && <div className="panel calendar-month" role="grid" aria-label="Monthly calendar">
          <div className="calendar-weekdays">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-month-grid">{monthDates(anchor).map(date => {
            const tasksOnDate = byDay.get(date) ?? [];
            const plannedOnDate = plannedByDay.filter(e=>e.date===date);
            return <div key={date} className={`calendar-cell ${date.slice(0, 7) !== anchor.slice(0, 7) ? 'outside' : ''} ${date === today ? 'is-today' : ''}`} data-testid={`calendar-date-${date}`} {...dropProps(date)}>
              <div className="calendar-cell-head"><button type="button" className="calendar-select-date" aria-label={`Select ${date} for day copy`} aria-pressed={selectedDates.includes(date)} onClick={()=>{setSelectedDates(s=>s.includes(date)?s.filter(d=>d!==date):[...s,date].sort());setSelectionOpen(true);}} title="Select for copy/paste">▢</button><button className="calendar-day-number" onClick={() => openDay(date)} title={`View ${formatDate(date)}`}>{Number(date.slice(-2))}</button><button className="calendar-cell-add" aria-label={`Add task on ${date}`} title="Add on this date" onClick={() => addAt(date)}><Plus size={15}/></button></div>
              <div className="calendar-cell-entries">{plannedOnDate.slice(0,2).map(item=><button key={item.id} type="button" className="calendar-chip plan-calendar-chip" onClick={()=>openDay(date)} title="Open day planner">{item.title}</button>)}{tasksOnDate.slice(0, Math.max(0,3-plannedOnDate.length)).map(item => entry(item, true))}{tasksOnDate.length > 3 && <button className="calendar-more" onClick={() => openDay(date)}>+{tasksOnDate.length - 3} more</button>}</div>
            </div>;
          })}</div>
        </div>}
        {scale === 'year' && <div className="calendar-year" aria-label="Yearly calendar">{Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
          const monthAnchor = `${anchor.slice(0, 4)}-${String(month).padStart(2, '0')}-01`;
          const days = monthDates(monthAnchor);
          const count = occurrences.filter(item => item.date.slice(0, 7) === monthAnchor.slice(0, 7)).length + plannedByDay.filter(e=>e.date.startsWith(monthAnchor.slice(0,7))).length;
          return <button type="button" className="panel calendar-year-month" key={month} onClick={() => { setAnchor(monthAnchor); setScale('month'); }} aria-label={`Open ${dateTitle(monthAnchor, 'month')}, ${count} tasks`}>
            <div className="year-month-heading"><strong>{dateTitle(monthAnchor, 'month').split(' ')[0]}</strong><span>{count} tasks</span></div>
            <div className="year-mini-grid">{WEEKDAYS.map(day => <small key={day}>{day[0]}</small>)}{days.map(date => {
              const occurrences = byDay.get(date) ?? [];
              const plannedCount=plannedByDay.filter(e=>e.date===date).length;
              const labels = occurrences.map(item => visibleStatus(item.task, item.completed));
              const important = (['postponed', 'progressing', 'started', 'not-started', 'finished'] as TaskStatus[]).find(status => labels.includes(status));
              const summary = [...new Set(labels)].map(status => STATUS_LABEL[status]).join(', ');
              return <span key={date} title={occurrences.length ? `${date}: ${occurrences.length} task(s) — ${summary}` : date}
                className={`${date.slice(0, 7) === monthAnchor.slice(0, 7) ? '' : 'outside'} ${date === today ? 'today' : ''} ${occurrences.length || plannedCount ? 'scheduled' : ''} ${important ? `status-${important}` : ''}`}>
                {date.slice(0, 7) === monthAnchor.slice(0, 7) ? Number(date.slice(-2)) : ''}
              </span>;
            })}</div>
          </button>;
        })}</div>}
        <p className="calendar-footnote">Click a date to open its planning window. Board tasks are reusable; each planned copy is independent. Use Copy / paste days to duplicate a single day or a multi-day routine. Original recurring due-date items are still editable separately.</p>
      </div>
      <aside className="calendar-unscheduled panel" aria-label="Unscheduled tasks">
        <div className="calendar-unscheduled-head"><div><span className="eyebrow">YOUR BACKLOG</span><h3>Unscheduled <span>{unscheduled.length}</span></h3></div><button className="icon-button" title="Add an unscheduled task" aria-label="Add unscheduled task" onClick={() => onEdit(null, 'urgent')}><Plus size={17}/></button></div>
        <p>These tasks have no due date. Schedule them only when you know the date.</p>
        <div className="calendar-unscheduled-list">{unscheduled.slice(0, 35).map(task => <div className="calendar-unscheduled-item" key={task.id}><button onClick={() => onEdit(task)}><strong>{task.title}</strong><small>{task.category}</small></button><button className="text-link" aria-label={`Schedule ${task.title}`} onClick={() => onEdit(task, task.lane, anchor)}>Schedule</button></div>)}</div>
        {unscheduled.length > 35 && <p>{unscheduled.length - 35} more unscheduled tasks. Narrow by area or search to find them.</p>}
      </aside>
    </div>
  </>;
}
