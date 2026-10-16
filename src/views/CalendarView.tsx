import { useAreas } from '../lib/areas';
import type { TrackerLaunch } from './TrackerView';
import { useCallback, useMemo, useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, FileText, Plus, Search, X } from 'lucide-react';
import { type BoardState, type Category, type Completion, type Lane, type PlannedEntry, type Task, type TaskStatus } from '../model';
import { addDays, calendarOccurrences, dateTitle, dateUTC, monthDates, shiftCalendar, visibleRange, type CalendarScale, type CalendarOccurrence } from '../lib/calendar';
import { formatDate } from '../lib/display';
import { CalendarEntry } from '../components/CalendarEntry';
import { STATUS_LABEL, STATUS_ORDER, visibleStatus } from '../lib/progress';
import { DayPlanModal } from '../components/planning/DayPlanModal';

const SCALES: { id: CalendarScale; label: string }[] = [
  { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'year', label: 'Year' }
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

interface Props {
  board: BoardState; setBoard: Dispatch<SetStateAction<BoardState>>;
  onTracker: (launch: TrackerLaunch) => void;
  tasks: Task[];
  completions: Completion[];
  today: string;
  onEdit: (task: Task | null, lane?: Lane, defaultDate?: string) => void;
  onDuplicate: (task: Task) => void;
  onStatus: (id: string, status: TaskStatus, postponedTo?: string, occurrenceDate?: string) => void;
  onReschedule: (id: string, date: string) => void;
}

/** Task data lives in the domain model. The calendar only renders occurrences. */
export function CalendarView({ board, setBoard, tasks, completions, today, onEdit, onDuplicate, onStatus, onReschedule, onTracker }: Props) {
  const areas = useAreas();
  const [scale, setScale] = useState<CalendarScale>('month');
  const [anchor, setAnchor] = useState(today);
  const [category, setCategory] = useState<Category | 'All'>('All');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => tasks.filter(t => !t.archivedAt &&
    (category === 'All' || t.category === category) &&
    (!search.trim() || `${t.title} ${t.description} ${t.category}`.toLowerCase().includes(search.trim().toLowerCase()))
  ), [tasks, category, search]);
  const range = visibleRange(anchor, scale);
  const occurrences = useMemo(() => calendarOccurrences(filtered, completions, range.start, range.end), [filtered, completions, range.start, range.end]);
  const byDay = useMemo(() => {
    const result = new Map<string, CalendarOccurrence[]>();
    for (const occurrence of occurrences) result.set(occurrence.date, [...result.get(occurrence.date) ?? [], occurrence]);
    return result;
  }, [occurrences]);
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
  const dayEntries = byDay.get(anchor) ?? [];
  const withTime = dayEntries.filter(item => item.task.scheduledTime);
  const anytime = dayEntries.filter(item => !item.task.scheduledTime);
  const otherHours = withTime.filter(item => { const h = Number(item.task.scheduledTime.slice(0, 2)); return h < 6 || h > 22; });

  const [planningDate, setPlanningDate] = useState<string | null>(null);
  const clickedDayRef = useRef<HTMLElement | null>(null);

  const openPlanModal = useCallback((date: string, element?: HTMLElement) => {
    let target = element ?? (document.activeElement as HTMLElement) ?? null;
    if (target && !target.matches('button, a, input, select, textarea, [tabindex]')) {
      const focusable = target.querySelector<HTMLElement>('.calendar-day-number, .calendar-week-heading button, button');
      if (focusable) target = focusable;
    }
    clickedDayRef.current = target;
    setPlanningDate(date);
  }, []);

  const closePlanModal = useCallback(() => {
    setPlanningDate(null);
    requestAnimationFrame(() => {
      clickedDayRef.current?.focus?.();
    });
  }, []);

  const plannedByDate = useMemo(() => {
    const result = new Map<string, PlannedEntry[]>();
    const entries = board?.plannedEntries ?? [];
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    for (const p of entries) {
      const source = taskMap.get(p.sourceTaskId);
      if (!source || source.archivedAt) continue;
      if (category !== 'All' && source.category !== category) continue;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const match = `${p.title} ${p.notes ?? ''} ${source.category}`.toLowerCase().includes(q);
        if (!match) continue;
      }
      result.set(p.date, [...(result.get(p.date) ?? []), p]);
    }
    for (const [, list] of result.entries()) {
      list.sort((a, b) => a.order - b.order || (a.createdAt || '').localeCompare(b.createdAt || ''));
    }
    return result;
  }, [board?.plannedEntries, tasks, category, search]);

  const plannedEntryChip = (p: PlannedEntry, date: string, _compact = false) => (
    <button
      type="button"
      key={`planned-${p.id}`}
      className={`calendar-chip planned-chip status-${p.status}`}
      title={`Planned: ${p.title} — ${STATUS_LABEL[p.status]}. Click to plan.`}
      data-testid={`calendar-planned-${p.id}`}
      onClick={(e) => {
        e.stopPropagation();
        openPlanModal(date, e.currentTarget);
      }}
    >
      <span className={`calendar-status-dot status-${p.status}`} aria-hidden="true" />
      <span className="calendar-chip-title">{p.title}</span>
    </button>
  );

  return <>
    <style>{`
      .planned-chip {
        display: flex;
        align-items: center;
        gap: 5px;
        background: var(--soft-purple, #f4edff);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 2px 6px;
        font-size: 11px;
        color: var(--ink);
        cursor: pointer;
        width: 100%;
        text-align: left;
        min-height: 24px;
      }
      .planned-chip:hover {
        filter: brightness(0.97);
      }
      .planned-chip .calendar-chip-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }
      .compact-calendar-toolbar .calendar-toolbar-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        width: 100%;
      }
      .compact-calendar-toolbar .calendar-tracker-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      @media (min-width: 768px) {
        .compact-calendar-toolbar {
          padding: 8px 12px;
          margin-bottom: 12px;
          gap: 6px;
        }
        .compact-calendar-toolbar .calendar-toolbar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: nowrap;
          gap: 8px;
          width: 100%;
        }
        .compact-calendar-toolbar .calendar-navigation {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .compact-calendar-toolbar .calendar-navigation h2 {
          font-size: 15px;
          margin: 0 0 0 4px;
          white-space: nowrap;
        }
        .compact-calendar-toolbar .calendar-today-button {
          padding: 4px 8px;
          font-size: 12px;
        }
        .compact-calendar-toolbar .calendar-scale-switch {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .compact-calendar-toolbar .calendar-scale-switch button {
          padding: 5px 8px;
          font-size: 12px;
        }
        .compact-calendar-toolbar .calendar-filter-row {
          display: flex;
          align-items: center;
          margin: 0;
          gap: 6px;
          flex-wrap: nowrap;
          min-width: 0;
          flex-shrink: 1;
        }
        .compact-calendar-toolbar .calendar-filter {
          width: 95px;
          height: 32px;
          padding: 0 6px;
          gap: 4px;
          flex-shrink: 1;
        }
        .compact-calendar-toolbar .calendar-filter input {
          font-size: 11px;
          width: 100%;
          min-width: 0;
        }
        .compact-calendar-toolbar .calendar-filter-select {
          height: 32px;
          padding: 0 6px;
          font-size: 11px;
          gap: 4px;
          flex-shrink: 0;
        }
        .compact-calendar-toolbar .calendar-filter-select select {
          padding: 2px 4px;
          font-size: 11px;
          max-width: 85px;
        }
        .compact-calendar-toolbar .calendar-tracker-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 12px;
          padding: 6px 10px;
          height: 32px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .compact-calendar-toolbar .calendar-tracker-btn .calendar-tracker-text {
          display: none;
        }
        .compact-calendar-toolbar .calendar-subbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding-top: 6px;
          border-top: 1px solid var(--border);
          font-size: 11px;
        }
        .compact-calendar-toolbar .calendar-legend {
          margin: 0;
          gap: 10px;
        }
        .compact-calendar-toolbar .calendar-count {
          font-size: 11px;
          color: var(--muted);
          white-space: nowrap;
        }
      }
      @media (min-width: 1024px) {
        .compact-calendar-toolbar .calendar-toolbar-row {
          gap: 12px;
        }
        .compact-calendar-toolbar .calendar-filter {
          width: 120px;
        }
        .compact-calendar-toolbar .calendar-filter-select select {
          max-width: 110px;
        }
      }
      @media (min-width: 1200px) {
        .compact-calendar-toolbar .calendar-tracker-btn .calendar-tracker-text {
          display: inline;
        }
        .compact-calendar-toolbar .calendar-filter {
          width: 150px;
        }
      }
    `}</style>
    <div className="page-title-row calendar-page-title"><div><span className="eyebrow">MAKE TIME FOR WHAT MATTERS</span><h1>Calendar <span className="heading-sparkle">✳</span></h1><p>Your tasks and appointments, on the dates you choose. Undated tasks stay unscheduled.</p></div><button className="button button-primary" onClick={() => addAt(anchor)}><Plus size={17}/> Add on {formatDate(anchor)}</button></div>
    <section className="calendar-toolbar panel compact-calendar-toolbar" aria-label="Calendar controls">
      <div className="calendar-toolbar-row">
        <div className="calendar-navigation">
          <button className="icon-button" aria-label="Previous period" onClick={() => setAnchor(value => shiftCalendar(value, scale, -1))}><ChevronLeft size={20}/></button>
          <button className="button button-secondary calendar-today-button" onClick={() => setAnchor(today)}>Today</button>
          <button className="icon-button" aria-label="Next period" onClick={() => setAnchor(value => shiftCalendar(value, scale, 1))}><ChevronRight size={20}/></button>
          <h2>{dateTitle(anchor, scale)}</h2>
        </div>
        <div className="calendar-scale-switch" role="group" aria-label="Calendar view">
          {SCALES.map(item => <button key={item.id} type="button" aria-pressed={scale === item.id} className={scale === item.id ? 'selected' : ''} onClick={() => setScale(item.id)}>{item.label}</button>)}
        </div>
        <div className="calendar-filter-row">
          <label className="calendar-filter"><Search size={16}/><input aria-label="Search calendar tasks" placeholder="Find a scheduled task" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="Clear calendar search" onClick={() => setSearch('')}><X size={15}/></button>}</label>
          <label className="calendar-filter-select">Area <select aria-label="Calendar category" value={category} onChange={e => setCategory(e.target.value as Category | 'All')}><option value="All">All areas</option>{areas.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}</select></label>
        </div>
        <button className="button button-primary calendar-tracker-btn" aria-label="One-page view & PDF" title="One-page view & PDF" onClick={() => onTracker({ anchor, scale, area: category })}>
          <FileText size={16} aria-hidden="true" />
          <span className="calendar-tracker-text">One-page view & PDF</span>
        </button>
      </div>
      <div className="calendar-subbar">
        <div className="calendar-legend" aria-label="Task status legend">{STATUS_ORDER.map(status => <span key={status}><span className={`calendar-status-dot status-${status}`}/>{STATUS_LABEL[status]}</span>)}</div>
        <span className="calendar-count">{occurrences.length} scheduled {occurrences.length === 1 ? 'occurrence' : 'occurrences'} shown</span>
      </div>
    </section>
    <div className="calendar-layout">
      <div className="calendar-main">
        {scale === 'day' && <section className="panel calendar-day">
          <div className="calendar-day-heading"><CalendarDays size={19}/><h3>{dateTitle(anchor, 'day')}</h3><button type="button" className="button button-secondary" onClick={() => addAt(anchor)}><Plus size={15}/> Add task</button></div>
          <div className="calendar-anytime" {...dropProps(anchor)}><h3>Anytime</h3>{anytime.length ? anytime.map(item => entry(item)) : <p>Nothing scheduled without a time. Add a task or drag one here.</p>}</div>
          <div className="calendar-hours">{HOURS.map(hour => <div key={hour} className="calendar-hour" {...dropProps(anchor)}>
            <div className="calendar-hour-label">{String(hour).padStart(2, '0')}:00</div>
            <div className="calendar-hour-body">{withTime.filter(item => Number(item.task.scheduledTime.slice(0, 2)) === hour).map(item => entry(item))}</div>
          </div>)}{otherHours.length > 0 && <div className="calendar-hour"><div className="calendar-hour-label">Other</div><div className="calendar-hour-body">{otherHours.map(item => entry(item))}</div></div>}</div>
        </section>}
        {scale === 'week' && <div className="calendar-week-scroller"><div className="calendar-week" role="grid" aria-label="Weekly calendar">
          {Array.from({ length: 7 }, (_, i) => addDays(range.start, i)).map(date => {
            const tasksOnDate = byDay.get(date) ?? [];
            const plannedOnDate = plannedByDate.get(date) ?? [];
            return <section
              className={`calendar-week-day ${date === today ? 'is-today' : ''}`}
              key={date}
              data-testid={`calendar-date-${date}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
                const button = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.calendar-week-heading button');
                openPlanModal(date, button ?? (e.currentTarget as HTMLElement));
              }}
              {...dropProps(date)}
            >
              <div className="calendar-week-heading">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openPlanModal(date, e.currentTarget);
                  }}
                  title={`Plan ${formatDate(date)}`}
                  aria-label={`Plan ${date}`}
                >
                  <span>{WEEKDAYS[(dateUTC(date).getUTCDay() + 6) % 7]}</span>
                  <strong>{date.slice(-2)}</strong>
                </button>
                <button
                  type="button"
                  aria-label={`Add task on ${date}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    addAt(date);
                  }}
                >
                  <Plus size={15}/>
                </button>
              </div>
              <div className="calendar-week-items">
                {tasksOnDate.map(item => entry(item))}
                {plannedOnDate.map(p => plannedEntryChip(p, date))}
                {!tasksOnDate.length && !plannedOnDate.length && <p className="calendar-week-empty">Drop a task or add one</p>}
              </div>
            </section>;
          })}
        </div></div>}
        {scale === 'month' && <div className="panel calendar-month" role="grid" aria-label="Monthly calendar">
          <div className="calendar-weekdays">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-month-grid">{monthDates(anchor).map(date => {
            const tasksOnDate = byDay.get(date) ?? [];
            const plannedOnDate = plannedByDate.get(date) ?? [];
            const visibleDue = tasksOnDate.slice(0, 3);
            const visiblePlanned = plannedOnDate.slice(0, 3);
            const hasMore = tasksOnDate.length > 3 || plannedOnDate.length > 3;
            const extraCount = Math.max(0, tasksOnDate.length - 3) + Math.max(0, plannedOnDate.length - 3);

            return <div
              key={date}
              className={`calendar-cell ${date.slice(0, 7) !== anchor.slice(0, 7) ? 'outside' : ''} ${date === today ? 'is-today' : ''}`}
              data-testid={`calendar-date-${date}`}
              // Keep a blank gutter available for day planning beside task chips.
              style={{ paddingInline: 8 }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
                const button = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.calendar-day-number');
                openPlanModal(date, button ?? (e.currentTarget as HTMLElement));
              }}
              {...dropProps(date)}
            >
              <div className="calendar-cell-head">
                <button
                  type="button"
                  className="calendar-day-number"
                  onClick={(e) => {
                    e.stopPropagation();
                    openPlanModal(date, e.currentTarget);
                  }}
                  title={`Plan ${formatDate(date)}`}
                  aria-label={`Plan ${date}`}
                >
                  {Number(date.slice(-2))}
                </button>
                <button
                  type="button"
                  className="calendar-cell-add"
                  aria-label={`Add task on ${date}`}
                  title="Add on this date"
                  onClick={(e) => {
                    e.stopPropagation();
                    addAt(date);
                  }}
                >
                  <Plus size={15}/>
                </button>
              </div>
              <div className="calendar-cell-entries">
                {visibleDue.map(item => entry(item, true))}
                {visiblePlanned.map(p => plannedEntryChip(p, date, true))}
                {hasMore && (
                  <button
                    type="button"
                    className="calendar-more"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPlanModal(date, e.currentTarget);
                    }}
                  >
                    +{extraCount} more
                  </button>
                )}
              </div>
            </div>;
          })}</div>
        </div>}
        {scale === 'year' && <div className="calendar-year" aria-label="Yearly calendar">{Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
          const monthAnchor = `${anchor.slice(0, 4)}-${String(month).padStart(2, '0')}-01`;
          const days = monthDates(monthAnchor);
          const count = occurrences.filter(item => item.date.slice(0, 7) === monthAnchor.slice(0, 7)).length;
          return <button type="button" className="panel calendar-year-month" key={month} onClick={() => { setAnchor(monthAnchor); setScale('month'); }} aria-label={`Open ${dateTitle(monthAnchor, 'month')}, ${count} tasks`}>
            <div className="year-month-heading"><strong>{dateTitle(monthAnchor, 'month').split(' ')[0]}</strong><span>{count} tasks</span></div>
            <div className="year-mini-grid">{WEEKDAYS.map(day => <small key={day}>{day[0]}</small>)}{days.map(date => {
              const occurrences = byDay.get(date) ?? [];
              const labels = occurrences.map(item => visibleStatus(item.task, item.completed));
              const important = (['postponed', 'progressing', 'started', 'not-started', 'finished'] as TaskStatus[]).find(status => labels.includes(status));
              const summary = [...new Set(labels)].map(status => STATUS_LABEL[status]).join(', ');
              return <span key={date} title={occurrences.length ? `${date}: ${occurrences.length} task(s) — ${summary}` : date}
                className={`${date.slice(0, 7) === monthAnchor.slice(0, 7) ? '' : 'outside'} ${date === today ? 'today' : ''} ${occurrences.length ? 'scheduled' : ''} ${important ? `status-${important}` : ''}`}>
                {date.slice(0, 7) === monthAnchor.slice(0, 7) ? Number(date.slice(-2)) : ''}
              </span>;
            })}</div>
          </button>;
        })}</div>}
        <p className="calendar-footnote">Drag tasks between dates on desktop or edit a task's date on mobile. Moving a repeating task moves its whole series, not an individual occurrence. Removing it from the calendar keeps it on the task board.</p>
      </div>
      <aside className="calendar-unscheduled panel" aria-label="Unscheduled tasks">
        <div className="calendar-unscheduled-head"><div><span className="eyebrow">YOUR BACKLOG</span><h3>Unscheduled <span>{unscheduled.length}</span></h3></div><button className="icon-button" title="Add an unscheduled task" aria-label="Add unscheduled task" onClick={() => onEdit(null, 'urgent')}><Plus size={17}/></button></div>
        <p>These tasks have no due date. Schedule them only when you know the date.</p>
        <div className="calendar-unscheduled-list">{unscheduled.slice(0, 35).map(task => <div className="calendar-unscheduled-item" key={task.id}><button onClick={() => onEdit(task)}><strong>{task.title}</strong><small>{task.category}</small></button><button className="text-link" aria-label={`Schedule ${task.title}`} onClick={() => onEdit(task, task.lane, anchor)}>Schedule</button></div>)}</div>
        {unscheduled.length > 35 && <p>{unscheduled.length - 35} more unscheduled tasks. Narrow by area or search to find them.</p>}
      </aside>
    </div>
    {planningDate && (
      <DayPlanModal
        date={planningDate}
        board={board}
        setBoard={setBoard}
        onDismiss={closePlanModal}
        returnFocusTo={clickedDayRef.current}
      />
    )}
  </>;
}
