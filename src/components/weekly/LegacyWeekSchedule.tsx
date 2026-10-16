import { useMemo } from 'react';
import { Plus, Target } from 'lucide-react';
import type { BoardState, Lane, Task } from '../../model';
import type { CalendarOccurrence } from '../../lib/calendar';
import { formatDate } from '../../lib/display';
import { STATUS_LABEL, visibleStatus } from '../../lib/progress';
import { STATUS_POINTS } from '../../lib/scoring';

const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const;
interface Props {
  board: BoardState; days: string[]; scheduled: CalendarOccurrence[]; today: string;
  plannedIds: Set<string>; weekStart: string;
  onEdit: (task: Task|null, lane?: Lane, defaultDate?: string)=>void;
  onInclude: (weekStart:string, taskId:string, include:boolean)=>void;
  onFocus: (day:string,taskId:string)=>void;
}
/** Existing recurrence/due-date projection is secondary to the board-first planner. */
export function LegacyWeekSchedule({board,days,scheduled,today,plannedIds,weekStart,onEdit,onInclude,onFocus}:Props){
  const byDay=useMemo(()=>{
    const grouped=new Map<string, CalendarOccurrence[]>();
    for(const item of scheduled)grouped.set(item.date,[...(grouped.get(item.date)??[]),item]);
    return grouped;
  },[scheduled]);
  return <section className="week-days-section week-legacy-projection" aria-label="Existing recurring appointments">
      <details><summary>View recurring tasks and previous due-date schedule</summary>
      <div className="week-section-title"><h2>Seven days, one clear plan</h2><p>Choose up to three priorities for each day. Open any task to edit it, or use Calendar to move its date.</p></div>
      <div className="week-days-grid">
        {days.map((date, index) => {
          const focusIds = board.dailyFocus?.[date] ?? [];
          const events = byDay.get(date) ?? [];
          return <section key={date} className={`week-day ${date === today ? 'is-today' : ''}`} aria-label={`${DAYS[index]}, ${formatDate(date)}`}>
            <div className="week-day-head">
              <span>{DAYS[index].slice(0, 3)}</span><strong>{Number(date.slice(-2))}</strong>
              <button type="button" aria-label={`Add task on ${formatDate(date)}`} title="Add task" onClick={() => onEdit(null, 'daily', date)}><Plus size={17}/></button>
            </div>
            <div className="week-day-focus"><Target size={14}/><span>{focusIds.length}/3 focused</span></div>
            <div className="week-day-events">
              {events.length ? events.map(item => {
                const status = visibleStatus(item.task, item.completed);
                const pinned = focusIds.includes(item.task.id);
                return <article className={`week-task status-${status}`} key={`${item.task.id}-${item.date}`}>
                  <button type="button" className="week-task-title" onClick={() => onEdit(item.task)}>
                    <strong>{item.task.title}</strong>
                    <small>{item.task.scheduledTime ? `${item.task.scheduledTime} · ` : ''}{STATUS_LABEL[status]} · {STATUS_POINTS[status]} pts</small>
                  </button>
                  <div className="week-task-controls">
                    <button type="button" className={`week-focus-toggle ${pinned ? 'is-selected' : ''}`}
                      aria-pressed={pinned} aria-label={`${pinned ? 'Remove' : 'Select'} ${item.task.title} ${pinned ? 'from' : 'for'} top three on ${formatDate(date)}`}
                      disabled={!pinned && focusIds.length >= 3}
                      onClick={() => onFocus(date, item.task.id)}><Target size={15}/></button>
                    <button type="button" className={`week-commit-toggle ${plannedIds.has(item.task.id) ? 'is-selected' : ''}`}
                      aria-pressed={plannedIds.has(item.task.id)}
                      onClick={() => onInclude(weekStart, item.task.id, !plannedIds.has(item.task.id))}>
                      {plannedIds.has(item.task.id) ? 'Planned' : '+ Plan'}
                    </button>
                  </div>
                </article>;
              }) : <p className="week-day-empty">Space for what matters.</p>}
            </div>
          </section>;
        })}
      </div>
      </details>
    </section>;
}
