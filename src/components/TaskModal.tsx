import { useAreas } from '../lib/areas';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ClipboardCheck, Plus, X } from 'lucide-react';
import { LANES, createTask, generateId, type Category, type Lane, type Priority, type Recurrence, type Subtask, type Task, type TaskStatus, brisbaneToday } from '../model';
import { RECUR_LABEL } from '../lib/display';
import { STATUS_LABEL, STATUS_ORDER } from '../lib/progress';

export function TaskModal({ task, defaultLane, defaultDate = '', defaultTime = '', effectiveStatus, isCopy = false, onDismiss, onSave }: {
  task: Task | null; defaultLane: Lane; defaultDate?: string; defaultTime?: string; effectiveStatus?: TaskStatus; isCopy?: boolean; onDismiss: () => void; onSave: (task: Task) => void;
}) {
  const areas = useAreas();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [lane, setLane] = useState<Lane>(task?.lane ?? defaultLane);
  const [category, setCategory] = useState<Category>(task?.category ?? areas.find(a => a.id === 'Personal')?.id ?? areas[0].id);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [date, setDate] = useState(defaultDate || task?.dueDate || '');
  const [scheduledTime, setScheduledTime] = useState(defaultTime || task?.scheduledTime || '');
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence ?? ({ urgent: 'none', daily: 'daily', weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', goals: 'none' } as Record<Lane, Recurrence>)[defaultLane]);
  const [estimate, setEstimate] = useState(task?.estimateMinutes ? String(task.estimateMinutes) : '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? []);
  const [newSubtask, setNewSubtask] = useState('');
  const [status, setStatus] = useState<TaskStatus>(effectiveStatus ?? task?.status ?? 'not-started');
  const [formError, setFormError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement) ?? null;
    titleRef.current?.focus();

    const inertedElements: HTMLElement[] = [];
    const scrim = scrimRef.current;
    if (scrim) {
      let current: HTMLElement | null = scrim;
      while (current && current !== document.body) {
        const parent: HTMLElement | null = current.parentElement;
        if (parent) {
          for (const sibling of Array.from(parent.children)) {
            if (sibling !== current && sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
              sibling.setAttribute('inert', '');
              (sibling as unknown as { inert?: boolean }).inert = true;
              inertedElements.push(sibling);
            }
          }
        }
        current = parent;
      }
    }

    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismissRef.current();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
      for (const el of inertedElements) {
        el.removeAttribute('inert');
        (el as unknown as { inert?: boolean }).inert = false;
      }
      openerRef.current?.focus?.();
    };
  }, []);
  function addSubtask() {
    if (!newSubtask.trim()) return;
    setSubtasks(old => [...old, { id: generateId(), title: newSubtask.trim(), done: false }]);
    setNewSubtask('');
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const alreadyPostponed = task?.status === 'postponed' && date === task.dueDate;
    if (status === 'postponed' && !alreadyPostponed && (!date || date <= (task?.dueDate && task.dueDate > brisbaneToday() ? task.dueDate : brisbaneToday()))) {
      setFormError('Choose a later date when postponing this task.'); return;
    }
    onSave(createTask({ ...(task ?? {}), id: task?.id, title, description, lane, category, priority, dueDate: date, scheduledTime, scheduleAnchor: task && date === task.dueDate ? (task.scheduleAnchor || date) : date, recurrence,
      estimateMinutes: Math.max(0, Number(estimate) || 0), subtasks, status, origin: isCopy ? 'personal' : task?.origin ?? 'personal' }));
  }
  return <div ref={scrimRef} className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onDismiss(); }}>
    <section ref={modalRef} className="task-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-head"><div><span className="eyebrow">MAKE IT HAPPEN</span><h2 id="modal-title">{isCopy ? 'Duplicate task' : task ? 'Edit task' : 'Create a task'}</h2></div><button aria-label="Close editor" type="button" className="icon-button" onClick={onDismiss}><X size={20}/></button></div>
      <form onSubmit={submit}>
        <div className="form-scroll">
          <label className="field full">Task name <input ref={titleRef} maxLength={250} required value={title} placeholder="What needs to get done?" onChange={e => setTitle(e.target.value)}/></label>
          <label className="field full">Notes <textarea rows={3} maxLength={10000} value={description} placeholder="Add context, a next step, or a reminder…" onChange={e => setDescription(e.target.value)}/></label>
          <div className="field-grid">
            <label className="field">Column <select value={lane} onChange={e => {
              const newLane = e.target.value as Lane; setLane(newLane);
            }}>{LANES.map(l => <option value={l.id} key={l.id}>{l.title}</option>)}</select></label>
            <label className="field">Area of life <select value={category} onChange={e => setCategory(e.target.value as Category)}>{areas.map(c => <option value={c.id} key={c.id}>{c.id}</option>)}</select></label>
            <label className="field">Status <select aria-label="Task status" value={status} onChange={e => { setStatus(e.target.value as TaskStatus); setFormError(''); }}>{STATUS_ORDER.map(value => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}</select></label>
            <label className="field">Priority <select value={priority} onChange={e => setPriority(e.target.value as Priority)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
            <label className="field">Repeat <select value={recurrence} onChange={e => setRecurrence(e.target.value as Recurrence)}>{(Object.keys(RECUR_LABEL) as Recurrence[]).map(r => <option key={r} value={r}>{RECUR_LABEL[r]}</option>)}</select></label>
            <label className="field">{status === 'postponed' ? 'Move to date (required)' : 'Due date (optional)'} <input type="date" required={status === 'postponed'} value={date} onChange={e => { setDate(e.target.value); setFormError(''); }}/></label>
            <label className="field">Start time (optional) <input type="time" aria-label="Start time (optional)" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}/></label>
            <label className="field">Time estimate (min) <input type="number" min="0" max="100000" placeholder="Optional" value={estimate} onChange={e => setEstimate(e.target.value)}/></label>
          </div>
          {status === 'postponed' && <p className="form-hint">Postponing moves this task to the selected later date. For repeating tasks it reschedules the series.</p>}
          {formError && <p className="field-error" role="alert">{formError}</p>}
          <div className="checklist-editor"><h3><ClipboardCheck size={17}/> Checklist <small>(optional, for multi-step tasks)</small></h3>
            {subtasks.map(s => <div className="checklist-editor-row" key={s.id}><input type="checkbox" checked={s.done} aria-label={`Mark ${s.title} complete`} onChange={e => setSubtasks(old => old.map(v => v.id === s.id ? { ...v, done: e.target.checked } : v))}/><span>{s.title}</span><button className="icon-button small" type="button" aria-label={`Remove ${s.title}`} onClick={() => setSubtasks(old => old.filter(v => v.id !== s.id))}><X size={16}/></button></div>)}
            <div className="checklist-add"><input value={newSubtask} maxLength={250} placeholder="Add a small step" onChange={e => setNewSubtask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}/><button type="button" aria-label="Add checklist item" onClick={addSubtask}><Plus size={18}/></button></div>
          </div>
        </div>
        <div className="modal-footer"><button type="button" className="button button-ghost" onClick={onDismiss}>Cancel</button><button type="submit" className="button button-primary"><Check size={17}/>{isCopy ? 'Create copy' : task ? 'Save changes' : 'Create task'}</button></div>
      </form>
    </section>
  </div>;
}

