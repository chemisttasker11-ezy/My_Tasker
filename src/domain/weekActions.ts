import type { BoardState, Task, WeekReview } from './types';
import { brisbaneToday, validISODate } from './time';
/** A weekly plan remains explicit, so postponement cannot silently inflate progress. */
export function setWeekCommitment(state: BoardState, weekStart: string, task: Task, include: boolean): BoardState {
  if (!validISODate(weekStart) || !weekStart || new Date(`${weekStart}T12:00:00Z`).getUTCDay() !== 1) return state;
  const current = state.weekPlans?.[weekStart] ?? { weekStart, commitments: [], review: null };
  const already = current.commitments.some(c => !c.entryId && c.taskId === task.id);
  if (already === include) return state;
  if (include && (task.archivedAt || current.commitments.length >= 150)) return state;
  const commitments = include
    ? [...current.commitments, {
      taskId: task.id, title: task.title, priority: task.priority,
      plannedDate: task.dueDate >= weekStart && task.dueDate <= addDaysUTC(weekStart, 6) ? task.dueDate : ''
    }]
    : current.commitments.filter(c => c.entryId || c.taskId !== task.id);
  const review = current.review ? { ...current.review, savedAt: '', scoreSnapshot: null } : null;
  return { ...state, weekPlans: { ...state.weekPlans, [weekStart]: { weekStart, commitments, review } } };
}

function addDaysUTC(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function addDaysUTC(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** Pick no more than three deliberate daily priorities; independent of task status. */
export function toggleDailyFocus(state: BoardState, day: string, taskId: string): BoardState {
  if (!validISODate(day) || !day || !state.tasks.some(t => t.id === taskId && !t.archivedAt) && !state.plannedEntries.some(e => e.id === taskId && e.date === day)) return state;
  const current = (state.dailyFocus?.[day] ?? []).filter(id => state.tasks.some(t => t.id === id && !t.archivedAt) || state.plannedEntries.some(e => e.id === id && e.date === day));
  const included = current.includes(taskId);
  if (!included && current.length >= 3) return state;
  const next = included ? current.filter(id => id !== taskId) : [...current, taskId];
  return { ...state, dailyFocus: { ...state.dailyFocus, [day]: next } };
}

/** The saved review freezes an end-of-week score for later comparison. */
export function saveWeekReview(state: BoardState, weekStart: string, notes: Pick<WeekReview, 'wins' | 'blockers' | 'adjustment'>, score: number | null, now = new Date()): BoardState {
  const plan = state.weekPlans?.[weekStart];
  if (!plan || ![notes.wins, notes.blockers, notes.adjustment].every(text => typeof text === 'string' && text.length <= 1400) ||
    (score !== null && (!Number.isInteger(score) || score < 0 || score > 100))) return state;
  return {
    ...state, weekPlans: {
      ...state.weekPlans,
      [weekStart]: { ...plan, review: {
        wins: notes.wins.trim(), blockers: notes.blockers.trim(), adjustment: notes.adjustment.trim(),
        savedAt: now.toISOString(), scoreSnapshot: addDaysUTC(weekStart, 6) < brisbaneToday(now) && plan.review?.savedAt ? plan.review.scoreSnapshot : score
      } }
    }
  };
}
