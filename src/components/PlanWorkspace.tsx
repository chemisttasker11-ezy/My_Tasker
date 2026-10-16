import { useMemo, useState, type DragEvent } from 'react';
import { ArrowDownToLine, Check, CheckCheck, ClipboardCopy, ClipboardPaste, Copy, GripVertical, MoveRight, Search, Target, Trash2 } from 'lucide-react';
import { type BoardState, type PlannedEntry, type TaskStatus } from '../model';
import { dateTitle } from '../lib/calendar';
import { dragPayload, entriesForDay, parseDragPayload, type DayClipboard } from '../lib/planning';
import { STATUS_LABEL, STATUS_ORDER } from '../lib/progress';

export interface PlanningActions {
  add: (sourceId: string, date: string) => void;
  clone: (entryId: string, date: string) => void;
  move: (entryId: string, date: string, index?: number) => void;
  update: (entryId: string, patch: Partial<PlannedEntry>) => void;
  remove: (entryId: string) => void;
  toggleStep: (entryId: string, stepId: string) => void;
  copy: (dates: string[]) => void;
  paste: (dates: string[], mode?: 'plan' | 'tasks') => void;
  clipboard: DayClipboard | null;
  focus: (date: string, entryId: string) => void;
}
interface Props { board: BoardState; dates: string[]; actions: PlanningActions; title?: string; compact?: boolean; }
/** Common source palette and independent occurrence editor, shared across all planning surfaces. */
export function PlanWorkspace({ board, dates, actions, title, compact = false }: Props) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('All');
  const [selected, setSelected] = useState(dates[0]);
  const [sourceDays, setSourceDays] = useState<string[]>([]);
  const [targetDays, setTargetDays] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [pasteAsTasks, setPasteAsTasks] = useState(false);
  const boardTasks = useMemo(() => board.tasks.filter(t => !t.archivedAt && (area === 'All' || t.category === area) &&
    (!query.trim() || (t.title + ' ' + t.description + ' ' + t.category).toLowerCase().includes(query.toLowerCase().trim()))), [board.tasks,query,area]);
  const activeDay = dates.includes(selected) ? selected : dates[0];
  function drag(event: DragEvent<HTMLElement>, kind: 'board'|'entry', id: string) {
    event.dataTransfer.setData('text/plain', dragPayload({ kind, id }));
    event.dataTransfer.effectAllowed = kind === 'board' ? 'copy' : 'move';
  }
  function drop(event: DragEvent<HTMLElement>, date: string, index?: number) {
    event.preventDefault();
    const payload = parseDragPayload(event.dataTransfer.getData('text/plain'));
    if (!payload) return;
    if (payload.kind === 'board') actions.add(payload.id,date);
    else actions.move(payload.id,date,index);
  }
  function toggleDay(current: string[], set: (value: string[]) => void, date: string) {
    set(current.includes(date) ? current.filter(d => d !== date) : [...current,date]);
  }
  return <section className={`plan-workspace ${compact ? 'plan-workspace-compact' : ''}`} aria-label="Build your plan">
    <div className="plan-workspace-title">
      <div><h2>{title ?? 'Build your days'}</h2><p>Drag a task from your board onto a day. On touchscreens, choose a day and tap Add.</p></div>
      <div className="plan-clipboard-actions">
        <button type="button" className="button button-secondary" onClick={() => actions.copy(sourceDays.length ? sourceDays : [activeDay])}><ClipboardCopy size={17}/> Copy {sourceDays.length || 1} day{sourceDays.length === 1 ? '' : 's'}</button>
        <button type="button" className="button button-secondary" disabled={!actions.clipboard} onClick={() => actions.paste(targetDays.length ? targetDays : [activeDay], pasteAsTasks ? 'tasks' : 'plan')}><ClipboardPaste size={17}/> Paste {targetDays.length || 1} day{targetDays.length === 1 ? '' : 's'}</button>
      </div>
    </div>
    <div className="plan-copy-guide">
      <span><ClipboardCopy size={15}/> Copy source days with checkboxes.</span>
      <span><ClipboardPaste size={15}/> Select destination days and paste.</span>
      {actions.clipboard && <strong>{actions.clipboard.days.length} day{actions.clipboard.days.length === 1 ? '' : 's'} copied</strong>}
      <label><input type="checkbox" checked={pasteAsTasks} onChange={event => setPasteAsTasks(event.target.checked)}/> Paste without times</label>
    </div>
    <div className="plan-workspace-layout">
      <aside className="plan-source panel" aria-label="My task board source">
        <div className="plan-source-head"><h3>My task board</h3><span>{boardTasks.length} available</span></div>
        <label className="plan-search"><Search size={17}/><input aria-label="Search task board for planning" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search all your tasks…"/></label>
        <label className="plan-area">Filter area <select aria-label="Filter board source by area" value={area} onChange={e => setArea(e.target.value)}><option>All</option>{board.areas.map(a => <option key={a.id} value={a.id}>{a.id}</option>)}</select></label>
        <div className="plan-source-list">
          {boardTasks.length ? boardTasks.map(task => <article className="plan-source-card" key={task.id} draggable onDragStart={e => drag(e,'board',task.id)}>
            <div><strong>{task.title}</strong><small>{task.category} · {task.priority} priority</small></div>
            <button type="button" onClick={() => actions.add(task.id,activeDay)} aria-label={`Add ${task.title} to ${activeDay}`} title={`Add to ${activeDay}`}><ArrowDownToLine size={17}/> Add</button>
          </article>) : <p className="plan-empty">No matching tasks. Clear your search or choose another area.</p>}
        </div>
      </aside>
      <div className="plan-day-grid" data-testid="plan-day-grid">
        {dates.map(date => {
          const items=entriesForDay(board,date);
          const focus=board.dailyFocus[date]??[];
          return <section className={`plan-day panel ${date===activeDay?'plan-day-selected':''}`} key={date}
            data-testid={`plan-day-${date}`}
            onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,date)}>
            <header className="plan-day-heading">
              <button type="button" className="plan-day-select" aria-pressed={activeDay===date} onClick={()=>setSelected(date)}>{dateTitle(date,'day')}</button>
              <strong>{items.length} tasks</strong>
            </header>
            <div className="plan-day-options">
              <label title="Copy from this date"><input type="checkbox" aria-label={`Copy source day ${date}`} checked={sourceDays.includes(date)} onChange={()=>toggleDay(sourceDays,setSourceDays,date)}/> Copy</label>
              <label title="Paste onto this date"><input type="checkbox" aria-label={`Paste target day ${date}`} checked={targetDays.includes(date)} onChange={()=>toggleDay(targetDays,setTargetDays,date)}/> Paste to</label>
              <span>{focus.length}/3 focus</span>
            </div>
            <div className="plan-day-cards">
              {items.length ? items.map((entry,index)=><article className={`plan-entry plan-status-${entry.status}`} key={entry.id} draggable onDragStart={e=>drag(e,'entry',entry.id)}
                data-testid={`plan-entry-${entry.id}`}>
                <div className="plan-entry-top">
                  <button type="button" className="plan-grip" aria-label={`Move ${entry.title}`} title="Drag to reorder or move to another day"><GripVertical size={16}/></button>
                  <button type="button" className="plan-entry-title" onClick={()=>setEditing(editing===entry.id?null:entry.id)}><strong>{entry.title}</strong><small>{entry.scheduledTime||'Anytime'} · {entry.priority} priority</small></button>
                  <button type="button" className={`plan-focus-toggle ${focus.includes(entry.id)?'active':''}`} title="Top three" aria-label={`${focus.includes(entry.id)?'Remove':'Add'} ${entry.title} ${focus.includes(entry.id)?'from':'to'} daily top three`} aria-pressed={focus.includes(entry.id)} disabled={!focus.includes(entry.id)&&focus.length>=3} onClick={()=>actions.focus(date,entry.id)}><Target size={16}/></button>
                </div>
                <div className="plan-entry-controls">
                  <label>Status <select aria-label={`Status for planned ${entry.title}`} value={entry.status} onChange={e=>actions.update(entry.id,{status:e.target.value as TaskStatus})}>{STATUS_ORDER.map(status=><option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select></label>
                  <button type="button" title="Duplicate this day's task" aria-label={`Duplicate planned ${entry.title}`} onClick={()=>actions.clone(entry.id,date)}><Copy size={16}/></button>
                  <button type="button" title="Remove from this day only" aria-label={`Remove planned ${entry.title}`} onClick={()=>actions.remove(entry.id)}><Trash2 size={16}/></button>
                </div>
                <div className="plan-order-actions">
                  <button type="button" disabled={index===0} onClick={()=>actions.move(entry.id,date,index-1)} aria-label={`Move ${entry.title} up`}>↑</button>
                  <button type="button" disabled={index===items.length-1} onClick={()=>actions.move(entry.id,date,index+1)} aria-label={`Move ${entry.title} down`}>↓</button>
                  {dates.length>1 && <button type="button" onClick={()=>actions.move(entry.id,dates[(dates.indexOf(date)+1)%dates.length])} aria-label={`Move ${entry.title} to next day`}><MoveRight size={15}/> Next day</button>}
                </div>
                {editing===entry.id && <div className="plan-entry-editor">
                  <label>Task name<input aria-label={`Edit planned task name ${entry.id}`} maxLength={250} value={entry.title} onChange={e=>actions.update(entry.id,{title:e.target.value})}/></label>
                  <label>Time<input type="time" aria-label={`Time for planned ${entry.title}`} value={entry.scheduledTime} onChange={e=>actions.update(entry.id,{scheduledTime:e.target.value})}/></label>
                  <label>Details<textarea rows={2} aria-label={`Notes for planned ${entry.title}`} value={entry.description} onChange={e=>actions.update(entry.id,{description:e.target.value})}/></label>
                  {entry.subtasks.map(step=><label key={step.id} className="plan-step"><input type="checkbox" checked={step.done} onChange={()=>actions.toggleStep(entry.id,step.id)}/>{step.title}</label>)}
                  <button type="button" className="button button-secondary" onClick={()=>setEditing(null)}><Check size={15}/> Done editing</button>
                </div>}
              </article>) : <div className="plan-empty-day"><CheckCheck size={23}/><p>Drop a board task here, or select this day and tap Add.</p></div>}
            </div>
          </section>;
        })}
      </div>
    </div>
  </section>;
}
