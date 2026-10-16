import { Circle, ClipboardList, Flag } from 'lucide-react';
import type { Lane, Task } from '../../model';
import { formatDate } from '../../lib/display';
import { STATUS_LABEL } from '../../lib/progress';
import { PRIORITY_WEIGHTS, scoreWeek } from '../../lib/scoring';

interface Props {
  summary: ReturnType<typeof scoreWeek>; plannedIds:Set<string>;
  candidates:Task[];backlog:Task[];weekStart:string;
  onInclude:(weekStart:string,taskId:string,include:boolean)=>void;
  onEdit:(task:Task|null,lane?:Lane,defaultDate?:string)=>void;
}
/** Commitments retain outstanding work even when dated copies move away. */
export function WeeklyCommitmentsPanel({summary,plannedIds,candidates,backlog,weekStart,onInclude,onEdit}:Props){
  return <section className="panel week-commitments" aria-label="Committed tasks">
        <header className="week-panel-head"><div><h2>My commitments</h2><p>{summary.planned} selected · Postponed work still counts in this week's score.</p></div><Flag size={19}/></header>
        {summary.items.length ? <div className="week-commit-list">{summary.items.map(item => <div className="week-commit-row" key={item.commitment.entryId ?? item.commitment.taskId}>
          <span className={`week-status-mark status-${item.status}`} aria-hidden="true"><Circle size={12}/></span>
          <div className="week-commit-details">
            <strong>{item.commitment.title}</strong>
            <span>{STATUS_LABEL[item.status]} · {item.points} pts · {PRIORITY_WEIGHTS[item.commitment.priority]}× weight{item.commitment.plannedDate ? ` · Planned ${formatDate(item.commitment.plannedDate)}` : ''}</span>
            {item.task && item.commitment.plannedDate && item.task.dueDate !== item.commitment.plannedDate && <small>Now scheduled {item.task.dueDate ? formatDate(item.task.dueDate) : 'without a date'} — still in this plan.</small>}
          </div>
          <strong className="week-earned-points">{item.earned}/{item.possible}</strong>
          {item.task && <button type="button" className="week-remove" onClick={() => onInclude(weekStart, item.commitment.taskId, false)} aria-label={`Remove ${item.commitment.title} from weekly plan`}>Remove</button>}
        </div>)}</div> : <div className="week-empty-commit"><ClipboardList size={26}/><h3>Your plan starts here</h3><p>Scheduled tasks appear below. Add only what you realistically expect to finish.</p></div>}
        <div className="week-pick-list"><h3>Available this week</h3>
          {candidates.slice(0, 12).map(task => <div className="week-pick-row" key={task.id}><span>{task.title}</span><button type="button" onClick={() => onInclude(weekStart, task.id, true)}>Add to plan</button></div>)}
          {!candidates.length && <p className="week-muted">No unplanned scheduled tasks. Use Calendar to schedule more.</p>}
        </div>
        {backlog.length > 0 && <div className="week-pick-list week-backlog"><h3>From your unscheduled board</h3>
          {backlog.map(task => <div className="week-pick-row" key={task.id}><span>{task.title}</span><button type="button" onClick={() => onEdit(task, task.lane, weekStart)}>Schedule</button></div>)}
        </div>}
      </section>;
}
