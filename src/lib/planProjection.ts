import { isCompleted, type BoardState, type PlannedEntry, type Task } from '../model';
import { calendarOccurrences, type CalendarOccurrence } from './calendar';

/**
 * Single schedule projection for Calendar, Tracker, day-copy and quote selection.
 * Existing due-date/recurrence records remain readable. Explicit planned copies
 * replace the visual occurrence of their source on the SAME day only.
 */
export function projectSchedule(board: BoardState, start: string, end: string, area = 'All', source?: Task[]) {
  const boardTasks = (source ?? board.tasks).filter(t => !t.archivedAt && (area === 'All' || t.category === area));
  const allowedIds = new Set(boardTasks.map(t => t.id));
  const planned = board.plannedEntries
    .filter(e => e.date >= start && e.date <= end && (area === 'All' || e.category === area) &&
      (source ? allowedIds.has(e.sourceTaskId) : true))
    .sort((a,b) => a.date.localeCompare(b.date) || a.order-b.order || a.id.localeCompare(b.id));
  const shadowed = new Set(planned.map(e => e.sourceTaskId + '@' + e.date));
  const legacy: CalendarOccurrence[] = calendarOccurrences(boardTasks, board.completions, start, end)
    .filter(o => !shadowed.has(o.task.id+'@'+o.date));
  return { planned, legacy };
}
/** A planned copy is rendered as its own compatible Task, never as its source's status. */
export function taskForPlanned(entry: PlannedEntry, source?: Task): Task {
  return {
    id: entry.id, templateId: undefined, title: entry.title, description: entry.description,
    lane: source?.lane ?? 'daily', category: entry.category, priority: entry.priority,
    dueDate: entry.date, scheduledTime: entry.scheduledTime, scheduleAnchor: entry.date,
    recurrence: 'none', estimateMinutes: entry.estimateMinutes,
    subtasks: entry.subtasks, status: entry.status,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt,
    completedAt: entry.status === 'finished' ? entry.updatedAt : '', archivedAt: '',
    origin: source?.origin ?? 'personal'
  };
}
export function relevantTasksForDate(board: BoardState, date: string): Task[] {
  const { planned, legacy } = projectSchedule(board, date, date);
  const sourceById = new Map(board.tasks.map(task => [task.id, task]));
  const current = [...planned.map(e => taskForPlanned(e,sourceById.get(e.sourceTaskId))), ...legacy.map(o => o.task)];
  const included = new Set([...planned.map(e => e.sourceTaskId), ...legacy.map(o => o.task.id)]);
  const undatedPriorities = board.tasks.filter(t => !t.archivedAt && !t.dueDate &&
    (t.lane === 'daily' || t.lane === 'urgent') && !included.has(t.id) &&
    !isCompleted(t, board.completions, date));
  return [...current, ...undatedPriorities];
}
