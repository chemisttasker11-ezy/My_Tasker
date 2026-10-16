import type { BoardState, Completion, Lane, Task, TaskStatus } from './types';
import { brisbaneToday, generateId, nextDueDate, periodKey, validISODate, validTime } from './time';
import { createTask } from './factory';
export function isCompleted(task: Task, completions: Completion[], today: string): boolean {
  if (task.recurrence === 'none') return Boolean(task.completedAt);
  return completions.some(c => c.taskId === task.id && c.periodKey === periodKey(task.recurrence, today));
}

/** Completing a repeating task closes the current period and starts fresh next period.
 * A completion snapshot lets Undo restore status, checklist and due date.
 */
export function toggleCompletion(state: BoardState, id: string, now = new Date()): BoardState {
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.archivedAt) return state;
  const today = brisbaneToday(now);
  const key = periodKey(task.recurrence, today);
  const matching = state.completions.find(c => c.taskId === id && c.periodKey === key);
  if (matching) {
    return {
      ...state,
      completions: state.completions.filter(c => c.id !== matching.id),
      tasks: state.tasks.map(t => {
        if (t.id !== id) return t;
        // Do not move a date backwards if the series was rescheduled after completion.
        const canRestore = matching.nextDueDate !== undefined && t.dueDate === matching.nextDueDate;
        return {
          ...t,
          completedAt: t.recurrence === 'none' ? '' : t.completedAt,
          dueDate: canRestore ? matching.previousDueDate ?? t.dueDate : t.dueDate,
          status: matching.previousStatus ?? 'not-started',
          subtasks: canRestore && matching.previousSubtasks ? matching.previousSubtasks : t.subtasks,
          updatedAt: now.toISOString()
        };
      })
    };
  }
  const repeating = task.recurrence !== 'none';
  const next = repeating && task.dueDate
    ? nextDueDate(task.scheduleAnchor || task.dueDate, task.recurrence, today >= task.dueDate ? today : task.dueDate)
    : task.dueDate;
  const completion: Completion = {
    id: generateId(), taskId: id, title: task.title, category: task.category,
    completedAt: now.toISOString(), periodKey: key,
    previousDueDate: task.dueDate, nextDueDate: next,
    previousStatus: task.status, previousSubtasks: task.subtasks.map(s => ({ ...s }))
  };
  const tasks = state.tasks.map(t => t.id !== id ? t : {
    ...t,
    completedAt: repeating ? '' : now.toISOString(),
    dueDate: next,
    status: repeating ? 'not-started' as TaskStatus : 'finished' as TaskStatus,
    subtasks: repeating ? t.subtasks.map(sub => ({ ...sub, done: false })) : t.subtasks,
    updatedAt: now.toISOString()
  });
  return { ...state, tasks, completions: [completion, ...state.completions] };
}

/** Changes a calendar schedule, not its task-board lane or existing completion log.
 * A recurring task is rescheduled as a whole series (not just one occurrence).
 */
export function rescheduleTask(state: BoardState, id: string, date: string, time?: string): BoardState {
  if (!validISODate(date) || (time !== undefined && !validTime(time))) return state;
  if (!state.tasks.some(t => t.id === id && !t.archivedAt)) return state;
  return {
    ...state,
    tasks: state.tasks.map(t => t.id !== id ? t : {
      ...t, dueDate: date, scheduleAnchor: date, scheduledTime: date ? (time ?? t.scheduledTime) : '',
      status: !date && t.status === 'postponed' ? 'not-started' : t.status, updatedAt: new Date().toISOString()
    })
  };
}

/** Clones task content without cloning identity, progress, or completion status/history. */
export function duplicateTask(task: Task): Task {
  return createTask({
    ...task, id: generateId(), templateId: undefined, title: `${task.title} (copy)`, origin: 'personal',
    createdAt: undefined, completedAt: '', archivedAt: '', status: 'not-started',
    subtasks: task.subtasks.map(s => ({ id: generateId(), title: s.title, done: false })),
    scheduleAnchor: task.dueDate
  });
}

/** Changing progress is deliberately independent from optional checklist ticks. */
export function setTaskStatus(state: BoardState, id: string, status: TaskStatus, postponedTo?: string, now = new Date()): BoardState {
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.archivedAt) return state;
  if (status === 'postponed') {
    const earliest = task.dueDate > brisbaneToday(now) ? task.dueDate : brisbaneToday(now);
    if (!postponedTo || !validISODate(postponedTo) || postponedTo <= earliest) return state;
  }
  const day = brisbaneToday(now);
  const done = isCompleted(task, state.completions, day);
  if (status === 'finished') return done ? state : toggleCompletion(state, id, now);
  const reopened = done ? toggleCompletion(state, id, now) : state;
  return {
    ...reopened,
    tasks: reopened.tasks.map(t => t.id === id ? {
      ...t, status,
      dueDate: status === 'postponed' ? postponedTo! : t.dueDate,
      scheduleAnchor: status === 'postponed' ? postponedTo! : t.scheduleAnchor,
      updatedAt: now.toISOString()
    } : t)
  };
}

/** Set a specific recurring calendar occurrence without rewriting today's period.
 * Non-completion progress changes are series-level and remain on the task editor.
 */
export function setCalendarOccurrenceStatus(
  state: BoardState, id: string, status: TaskStatus, occurrenceDate: string, postponedTo?: string,
  now = new Date()
): BoardState {
  const task = state.tasks.find(t=>t.id===id && !t.archivedAt);
  if (!task || !validISODate(occurrenceDate) || !occurrenceDate) return state;
  if (task.recurrence === 'none' || occurrenceDate === brisbaneToday(now)) {
    return setTaskStatus(state,id,status,postponedTo,now);
  }
  if (status !== 'finished' && status !== 'not-started') return state;
  const key = periodKey(task.recurrence,occurrenceDate);
  const matching = state.completions.find(c=>c.taskId===id && c.periodKey===key);
  if (status==='not-started') {
    return matching ? {...state,completions:state.completions.filter(c=>c.id!==matching.id)} : state;
  }
  if (matching || state.completions.length>=50000) return state;
  const completion: Completion = {
    id:generateId(),taskId:id,title:task.title,category:task.category,
    completedAt:now.toISOString(),periodKey:key,previousDueDate:task.dueDate,
    nextDueDate:task.dueDate,previousStatus:task.status,
    previousSubtasks:task.subtasks.map(s=>({...s}))
  };
  // Historical completion is a log entry; do not rewind dueDate/series anchor.
  return {...state,completions:[completion,...state.completions]};
}

/** Save modal changes, without creating fake completions or losing existing history. */
export function saveTaskChanges(state: BoardState, draft: Task, now = new Date()): BoardState {
  const prior = state.tasks.find(t => t.id === draft.id);
  const status = draft.status;
  let base = state;
  if (prior && isCompleted(prior, base.completions, brisbaneToday(now)) && status !== 'finished') {
    base = toggleCompletion(base, draft.id, now);
  }
  // Finished is a recorded occurrence. Leave the persisted pending status until
  // completion is recorded, so recurring tasks do not remain finished next time.
  const updated: Task = { ...draft, status: status === 'finished' ? (prior?.status ?? 'not-started') : status,
    updatedAt: now.toISOString() };
  base = { ...base, tasks: prior
    ? base.tasks.map(t => t.id === draft.id ? updated : t)
    : [...base.tasks, updated] };
  if (status === 'finished' && !isCompleted(updated, base.completions, brisbaneToday(now))) {
    return toggleCompletion(base, draft.id, now);
  }
  return base;
}

/** Pure Kanban reducer: destination position is independent of browser drag events. */
export function moveInBoard(state: BoardState, id: string, destination: Lane, overId?: string): BoardState {
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.archivedAt || (id === overId && destination === task.lane)) return state;
  const tasks = state.tasks.filter(t => t.id !== id);
  let index = overId ? tasks.findIndex(t => t.id === overId && t.lane === destination) : -1;
  if (index < 0) {
    let last = -1;
    tasks.forEach((entry, position) => {
      if (entry.lane === destination && !entry.archivedAt) last = position;
    });
    index = last >= 0 ? last + 1 : tasks.length;
  }
  tasks.splice(index, 0, { ...task, lane: destination, updatedAt: new Date().toISOString() });
  return { ...state, tasks };
}

