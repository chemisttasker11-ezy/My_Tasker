import { generateId, type BoardState, type PlannedEntry, type TaskStatus, type WeeklyPlan, type Task } from '../model';
import { addDays, mondayOf } from './calendar';
import { projectSchedule } from './planProjection';

/** DataTransfer contract shared across Today, Week, Calendar and the board palette. */
export const PLAN_DRAG_MIME = 'application/x-my-tasker-plan';
export type PlanDrag = { kind: 'board' | 'entry'; id: string };
export function dragPayload(data: PlanDrag): string { return data.kind + ':' + data.id; }
export function parseDragPayload(raw: string): PlanDrag | null {
  const match = /^(board|entry):([a-zA-Z0-9_-]{1,100})$/.exec(raw);
  return match ? { kind: match[1] as PlanDrag['kind'], id: match[2] } : null;
}
export function entriesForDay(state: Pick<BoardState, 'plannedEntries'>, day: string): PlannedEntry[] {
  return state.plannedEntries.filter(e => e.date === day).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
function snapshot(source: Pick<PlannedEntry, 'sourceTaskId' | 'title' | 'description' | 'category' | 'priority' | 'scheduledTime' | 'estimateMinutes' | 'subtasks'>, date: string, order: number, now: Date): PlannedEntry {
  return {
    id: generateId(), sourceTaskId: source.sourceTaskId, date, order,
    title: source.title, description: source.description, category: source.category, priority: source.priority,
    scheduledTime: source.scheduledTime, estimateMinutes: source.estimateMinutes,
    status: 'not-started', subtasks: source.subtasks.map(st => ({ id: generateId(), title: st.title, done: false })),
    createdAt: now.toISOString(), updatedAt: now.toISOString()
  };
}
function fromTask(t: Task) {
  return { sourceTaskId: t.id, title: t.title, description: t.description, category: t.category, priority: t.priority,
    scheduledTime: t.scheduledTime, estimateMinutes: t.estimateMinutes, subtasks: t.subtasks };
}
export function withCommitment(state: BoardState, entry: PlannedEntry): BoardState {
  const weekStart = mondayOf(entry.date);
  const old: WeeklyPlan = state.weekPlans[weekStart] ?? { weekStart, commitments: [], review: null };
  if (old.commitments.some(c => c.entryId === entry.id) || old.commitments.length >= 150) return state;
  const commitments = [...old.commitments, { taskId: entry.sourceTaskId, entryId: entry.id, title: entry.title,
    priority: entry.priority, plannedDate: entry.date }];
  return { ...state, weekPlans: { ...state.weekPlans,
    [weekStart]: { ...old, commitments, review: old.review ? { ...old.review, savedAt: '', scoreSnapshot: null } : null } } };
}
export function addEntry(state: BoardState, taskId: string, date: string, now = new Date(), autoCommit = true): BoardState {
  const source = state.tasks.find(t => t.id === taskId && !t.archivedAt);
  if (!source || !isDate(date) || state.plannedEntries.length >= 20000 || entriesForDay(state, date).length >= 200) return state;
  const entry = snapshot(fromTask(source), date, entriesForDay(state, date).length, now);
  const next = { ...state, plannedEntries: [...state.plannedEntries, entry] };
  return autoCommit ? withCommitment(next, entry) : next;
}
export function cloneEntry(state: BoardState, id: string, date: string, now = new Date(), autoCommit = true): BoardState {
  const source = state.plannedEntries.find(e => e.id === id);
  if (!source || !isDate(date) || state.plannedEntries.length >= 20000 || entriesForDay(state, date).length >= 200) return state;
  const entry = snapshot(source, date, entriesForDay(state, date).length, now);
  const next = { ...state, plannedEntries: [...state.plannedEntries, entry] };
  return autoCommit ? withCommitment(next, entry) : next;
}
export function moveEntry(state: BoardState, id: string, toDate: string, toIndex?: number, now = new Date()): BoardState {
  const moving = state.plannedEntries.find(e => e.id === id);
  if (!moving || !isDate(toDate)) return state;
  const destination = entriesForDay(state, toDate).filter(e => e.id !== id);
  if (moving.date !== toDate && destination.length >= 200) return state;
  const position = Math.max(0, Math.min(destination.length, toIndex ?? destination.length));
  destination.splice(position, 0, { ...moving, date: toDate, updatedAt: now.toISOString() });
  const oldDay = moving.date !== toDate ? entriesForDay(state, moving.date).filter(e => e.id !== id).map((e, i) => ({ ...e, order: i })) : [];
  const changed = [...destination.map((e, i) => ({ ...e, order: i })), ...oldDay];
  const index = new Map(changed.map(e => [e.id, e]));
  const dailyFocus = moving.date === toDate ? state.dailyFocus :
    { ...state.dailyFocus, [moving.date]: (state.dailyFocus[moving.date] ?? []).filter(v => v !== id) };
  const updated: BoardState = { ...state, dailyFocus, plannedEntries: state.plannedEntries.map(e => index.get(e.id) ?? e) };
  // A move across the week boundary starts a new commitment; the original
  // week retains its commitment at zero instead of silently erasing the miss.
  return mondayOf(moving.date) === mondayOf(toDate) ? updated :
    withCommitment(updated, destination[position] as PlannedEntry);
}
export function setEntryStatus(state: BoardState, id: string, status: TaskStatus, now = new Date()): BoardState {
  if (!['not-started', 'started', 'progressing', 'finished', 'postponed'].includes(status)) return state;
  return { ...state, plannedEntries: state.plannedEntries.map(e =>
    e.id === id ? { ...e, status, updatedAt: now.toISOString() } : e) };
}
export function editEntry(state: BoardState, id: string, patch: Partial<Pick<PlannedEntry, 'title' | 'description' | 'scheduledTime' | 'estimateMinutes' | 'priority' | 'status' | 'subtasks'>>, now = new Date()): BoardState {
  const old = state.plannedEntries.find(e => e.id === id);
  if (!old) return state;
  const merged = { ...old, ...patch };
  if (!merged.title.trim() || merged.title.length > 250 || merged.description.length > 10000 ||
    !['high','medium','low'].includes(merged.priority) ||
    !['not-started','started','progressing','finished','postponed'].includes(merged.status) ||
    (merged.scheduledTime !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(merged.scheduledTime)) ||
    !Number.isInteger(merged.estimateMinutes) || merged.estimateMinutes < 0 || merged.estimateMinutes > 100000 ||
    !Array.isArray(merged.subtasks) || merged.subtasks.length > 100 ||
    merged.subtasks.some(st => !st.id || !st.title.trim() || st.title.length > 250)) return state;
  return { ...state, plannedEntries: state.plannedEntries.map(e => e.id === id ? { ...merged, updatedAt: now.toISOString() } : e) };
}
export function toggleEntryStep(state: BoardState, id: string, stepId: string, now = new Date()): BoardState {
  const entry = state.plannedEntries.find(e => e.id === id);
  if (!entry || !entry.subtasks.some(s => s.id === stepId)) return state;
  return editEntry(state, id, { subtasks: entry.subtasks.map(s => s.id === stepId ? { ...s, done: !s.done } : s) }, now);
}
export function removeEntry(state: BoardState, id: string): BoardState {
  const entry = state.plannedEntries.find(e => e.id === id);
  if (!entry) return state;
  const rest = entriesForDay(state, entry.date).filter(e => e.id !== id).map((e, i) => ({ ...e, order: i }));
  const positions = new Map(rest.map(e => [e.id, e]));
  // Preserve a week's existing commitment. Missing copies score zero, avoiding hidden deletion.
  return { ...state, plannedEntries: state.plannedEntries.filter(e => e.id !== id).map(e => positions.get(e.id) ?? e),
    dailyFocus: { ...state.dailyFocus, [entry.date]: (state.dailyFocus[entry.date] ?? []).filter(v => v !== id) } };
}
export function setWeekCapacity(state: BoardState, weekStart: string, capacityHours: number, intention: string): BoardState {
  if (!isDate(weekStart) || mondayOf(weekStart) !== weekStart || !Number.isFinite(capacityHours) ||
    capacityHours < 0 || capacityHours > 168 || intention.length > 400) return state;
  const current = state.weekPlans[weekStart] ?? { weekStart, commitments: [], review: null };
  return { ...state, weekPlans: { ...state.weekPlans, [weekStart]: { ...current, capacityHours, intention } } };
}
function isDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
export interface CopyDay {
  date: string;
  entries: Array<Pick<PlannedEntry, 'sourceTaskId' | 'title' | 'description' | 'category' | 'priority' | 'scheduledTime' | 'estimateMinutes' | 'subtasks'>>;
}
export interface DayClipboard { days: CopyDay[]; }
/** Include both independent day copies and original dated/recurring board occurrences. */
export function copyDays(state: BoardState, dates: string[]): DayClipboard {
  const selected = [...new Set(dates.filter(isDate))].sort().slice(0, 31);
  const first = selected[0], last = selected.at(-1);
  const projected = first && last ? projectSchedule(state, first, last).legacy : [];
  return { days: selected.map(date => {
    const saved = entriesForDay(state, date);
    const legacy = projected.filter(o => o.date === date).map(o => fromTask(o.task));
    return { date, entries: [...saved, ...legacy] };
  }) };
}
/** 1 day -> many dates; equal counts -> pairwise; many days -> 1 starting date with offsets. */
export function pasteDays(state: BoardState, clipboard: DayClipboard, targets: string[], mode: 'plan' | 'tasks' = 'plan', now = new Date()): BoardState {
  const destinations = [...new Set(targets.filter(isDate))].sort();
  const days = clipboard.days.filter(day => isDate(day.date));
  if (!days.length || !destinations.length || destinations.length > 31 || days.length > 31) return state;
  if (days.length !== 1 && destinations.length !== 1 && days.length !== destinations.length) return state;
  const schedule = days.length === 1 ? destinations.map(date => ({ date, from: days[0] })) :
    destinations.length === 1 ? days.map(day => ({
      date: addDays(destinations[0], Math.round((new Date(day.date + 'T12:00:00Z').getTime() - new Date(days[0].date + 'T12:00:00Z').getTime()) / 86400000)),
      from: day
    })) : days.map((from, index) => ({ from, date: destinations[index] }));
  if (schedule.some(item => !isDate(item.date))) return state;
  const incoming = schedule.flatMap(item => item.from.entries.map(source => ({ date: item.date, source })));
  const countByDay = new Map<string, number>();
  for (const item of incoming) countByDay.set(item.date, (countByDay.get(item.date) ?? 0) + 1);
  if (state.plannedEntries.length + incoming.length > 20000 ||
    [...countByDay].some(([date, count]) => count + entriesForDay(state, date).length > 200)) return state;
  let result = state;
  for (const item of incoming) {
    const template = mode === 'tasks' ? { ...item.source, scheduledTime: '' } : item.source;
    const copy = snapshot(template, item.date, entriesForDay(result, item.date).length, now);
    result = withCommitment({ ...result, plannedEntries: [...result.plannedEntries, copy] }, copy);
  }
  return result;
}
