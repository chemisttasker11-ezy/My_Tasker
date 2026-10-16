import type { BoardState, Completion, PlannedEntry, Priority, Recurrence, Task, TaskStatus, WeekReview, WeeklyPlan } from './types';
import { CATEGORIES, LANES } from './constants';
import { validISODate, validTime } from './time';
import { validateQuoteSettings } from '../lib/quotes';
export function validateImported(raw: unknown): BoardState {
  if (!raw || typeof raw !== 'object') throw new Error('This is not a task backup.');
  const obj = raw as Partial<BoardState>;
  if (obj.version !== 1 || !Array.isArray(obj.tasks) || !Array.isArray(obj.completions) || obj.tasks.length > 10000 || obj.completions.length > 50000) {
    throw new Error('Unsupported or invalid task backup.');
  }
  const lanes = new Set(LANES.map(l => l.id));
  const areaInput = obj.areas ?? CATEGORIES;
  if (!Array.isArray(areaInput) || areaInput.length < 1 || areaInput.length > 40) throw new Error('Backup must contain between 1 and 40 areas.');
  const areaNames = new Set<string>();
  const areas = areaInput.map(a => {
    if (!a || typeof a.id !== 'string' || !a.id.trim() || a.id.length > 40 || a.id.trim().toLowerCase() === 'all' ||
      areaNames.has(a.id.trim().toLowerCase())) throw new Error('Backup contains invalid or duplicate areas.');
    areaNames.add(a.id.trim().toLowerCase());
    return { id: a.id.trim(), emoji: typeof a.emoji === 'string' ? a.emoji.slice(0, 8) : '●',
      tone: ['indigo', 'violet', 'pink', 'orange', 'teal'].includes(a.tone) ? a.tone : 'teal' };
  });
  const categories = new Set(areas.map(c => c.id));
  const recurrence = new Set<Recurrence>(['none', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly']);
  const priority = new Set<Priority>(['high', 'medium', 'low']);
  const statuses = new Set<TaskStatus>(['not-started', 'started', 'progressing', 'finished', 'postponed']);
  const ids = new Set<string>();
  const tasks: Task[] = obj.tasks.map((t: Task) => {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id || t.id.length > 100 || ids.has(t.id) ||
      typeof t.title !== 'string' || !t.title.trim() || t.title.length > 250 ||
      typeof t.description !== 'string' || t.description.length > 10000 ||
      !lanes.has(t.lane) || !categories.has(t.category) || !recurrence.has(t.recurrence) || !priority.has(t.priority) ||
      !validISODate(t.dueDate) || (t.scheduleAnchor !== undefined && !validISODate(t.scheduleAnchor)) ||
      (t.scheduledTime !== undefined && !validTime(t.scheduledTime)) ||
      (t.status !== undefined && !statuses.has(t.status)) ||
      !Array.isArray(t.subtasks) || t.subtasks.length > 100 ||
      !Number.isInteger(t.estimateMinutes) || t.estimateMinutes < 0 || t.estimateMinutes > 100000) {
      throw new Error('Backup contains invalid tasks.');
    }
    ids.add(t.id);
    const subtasks = t.subtasks.map(s => {
      if (!s || typeof s.id !== 'string' || typeof s.title !== 'string' || s.title.length > 250 || typeof s.done !== 'boolean') {
        throw new Error('Backup contains invalid checklist items.');
      }
      return { id: s.id.slice(0, 100), title: s.title, done: s.done };
    });
    return {
      ...t, subtasks,
      templateId: typeof t.templateId === 'string' && t.templateId.length <= 100 ? t.templateId : undefined,
      scheduledTime: t.scheduledTime || '',
      scheduleAnchor: t.scheduleAnchor || t.dueDate,
      status: t.completedAt ? 'finished' : t.status ?? 'not-started',
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : '',
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : '',
      completedAt: typeof t.completedAt === 'string' ? t.completedAt : '',
      archivedAt: typeof t.archivedAt === 'string' ? t.archivedAt : '',
      origin: ['notebook', 'personal', 'idea'].includes(t.origin) ? t.origin : 'personal'
    };
  });
  const completions = obj.completions.map((c: Completion) => {
    if (!c || typeof c.id !== 'string' || typeof c.taskId !== 'string' || typeof c.title !== 'string' || typeof c.completedAt !== 'string' || typeof c.periodKey !== 'string' || !categories.has(c.category)) {
      throw new Error('Backup contains invalid completion history.');
    }
    return { id: c.id.slice(0, 100), taskId: c.taskId.slice(0, 100), title: c.title.slice(0, 250), category: c.category, completedAt: c.completedAt, periodKey: c.periodKey.slice(0, 40), previousDueDate: validISODate(c.previousDueDate) ? c.previousDueDate : undefined,
      nextDueDate: validISODate(c.nextDueDate) ? c.nextDueDate : undefined,
      previousStatus: c.previousStatus && statuses.has(c.previousStatus) ? c.previousStatus : undefined,
      previousSubtasks: Array.isArray(c.previousSubtasks) && c.previousSubtasks.length <= 100 ? c.previousSubtasks.filter(s => s && typeof s.id === 'string' && typeof s.title === 'string' && s.title.length <= 250 && typeof s.done === 'boolean').map(s => ({ id: s.id.slice(0, 100), title: s.title, done: s.done })) : undefined }; 
  });
  // Backward-compatible with backups created before weekly planning was introduced.
  // Reject malformed optional records rather than persisting arbitrary imported shapes.
  const weekPlans: Record<string, WeeklyPlan> = Object.create(null) as Record<string, WeeklyPlan>;
  if (obj.weekPlans !== undefined) {
    if (!obj.weekPlans || typeof obj.weekPlans !== 'object' || Array.isArray(obj.weekPlans) || Object.keys(obj.weekPlans).length > 260) throw new Error('Invalid weekly plans in backup.');
    for (const [key, rawPlan] of Object.entries(obj.weekPlans)) {
      const plan = rawPlan as WeeklyPlan;
      if (!validISODate(key) || !key || new Date(`${key}T12:00:00Z`).getUTCDay() !== 1 ||
        !plan || typeof plan !== 'object' || plan.weekStart !== key ||
        !Array.isArray(plan.commitments) || plan.commitments.length > 150) throw new Error('Invalid weekly plan.');
      const seen = new Set<string>();
      const commitments = plan.commitments.map(item => {
        if (!item || typeof item.taskId !== 'string' || !item.taskId || item.taskId.length > 100 || seen.has(item.entryId || item.taskId) ||
          typeof item.title !== 'string' || item.title.length > 250 ||
          (item.entryId !== undefined && (typeof item.entryId !== 'string' || !item.entryId || item.entryId.length > 100)) ||
          !priority.has(item.priority) || !validISODate(item.plannedDate)) throw new Error('Invalid weekly commitment.');
        seen.add(item.entryId || item.taskId);
        return { taskId: item.taskId, entryId: item.entryId, title: item.title, priority: item.priority, plannedDate: item.plannedDate };
      });
      let review: WeekReview | null = null;
      if (plan.review !== null && plan.review !== undefined) {
        const r = plan.review;
        if (typeof r !== 'object' || typeof r.wins !== 'string' || typeof r.blockers !== 'string' ||
          typeof r.adjustment !== 'string' || [r.wins, r.blockers, r.adjustment].some(s => s.length > 1400) ||
          typeof r.savedAt !== 'string' || (r.scoreSnapshot !== null && (!Number.isInteger(r.scoreSnapshot) || r.scoreSnapshot < 0 || r.scoreSnapshot > 100))) throw new Error('Invalid weekly review.');
        review = { wins: r.wins, blockers: r.blockers, adjustment: r.adjustment, savedAt: r.savedAt, scoreSnapshot: r.scoreSnapshot };
      }
      const capacityHours = plan.capacityHours;
      if (capacityHours !== undefined && (!Number.isFinite(capacityHours) || capacityHours < 0 || capacityHours > 168)) throw new Error('Invalid weekly capacity.');
      if (plan.intention !== undefined && (typeof plan.intention !== 'string' || plan.intention.length > 400)) throw new Error('Invalid weekly intention.');
      weekPlans[key] = { weekStart: key, commitments, review, capacityHours: capacityHours ?? undefined, intention: plan.intention ?? '' };
    }
  }
  const dailyFocus: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  if (obj.dailyFocus !== undefined) {
    if (!obj.dailyFocus || typeof obj.dailyFocus !== 'object' || Array.isArray(obj.dailyFocus) || Object.keys(obj.dailyFocus).length > 1100) throw new Error('Invalid daily focus backup.');
    for (const [key, ids] of Object.entries(obj.dailyFocus)) {
      if (!validISODate(key) || !key || !Array.isArray(ids) || ids.length > 3 ||
        ids.some(id => typeof id !== 'string' || !id || id.length > 100) ||
        new Set(ids).size !== ids.length) throw new Error('Invalid daily focus selection.');
      dailyFocus[key] = ids;
    }
  }
  const plannedEntries: PlannedEntry[] = [];
  if (obj.plannedEntries !== undefined) {
    if (!Array.isArray(obj.plannedEntries) || obj.plannedEntries.length > 20000) throw new Error('Invalid planned entries in backup.');
    const entryIds = new Set<string>();
    for (const e of obj.plannedEntries) {
      if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id || e.id.length > 100 || entryIds.has(e.id) ||
        typeof e.sourceTaskId !== 'string' || !e.sourceTaskId || e.sourceTaskId.length > 100 ||
        !validISODate(e.date) || !e.date || !Number.isInteger(e.order) || e.order < 0 || e.order > 20000 ||
        typeof e.title !== 'string' || !e.title.trim() || e.title.length > 250 ||
        typeof e.description !== 'string' || e.description.length > 10000 ||
        !categories.has(e.category) || !priority.has(e.priority) || !validTime(e.scheduledTime) ||
        !Number.isInteger(e.estimateMinutes) || e.estimateMinutes < 0 || e.estimateMinutes > 100000 ||
        !statuses.has(e.status) || !Array.isArray(e.subtasks) || e.subtasks.length > 100 ||
        typeof e.createdAt !== 'string' || typeof e.updatedAt !== 'string') throw new Error('Invalid planned entry.');
      const checklistIds = new Set<string>();
      const subtasks = e.subtasks.map(s => {
        if (!s || typeof s.id !== 'string' || !s.id || s.id.length > 100 || checklistIds.has(s.id) ||
          typeof s.title !== 'string' || !s.title.trim() || s.title.length > 250 || typeof s.done !== 'boolean') throw new Error('Invalid planned checklist.');
        checklistIds.add(s.id);
        return { id: s.id, title: s.title, done: s.done };
      });
      entryIds.add(e.id);
      plannedEntries.push({ id: e.id, sourceTaskId: e.sourceTaskId, date: e.date, order: e.order,
        title: e.title, description: e.description, category: e.category, priority: e.priority,
        scheduledTime: e.scheduledTime, estimateMinutes: e.estimateMinutes, status: e.status,
        subtasks, createdAt: e.createdAt.slice(0, 60), updatedAt: e.updatedAt.slice(0, 60) });
    }
  }
  return { version: 1, tasks, completions, plannedEntries, weekPlans, dailyFocus, areas,
    quotes: validateQuoteSettings(obj.quotes), theme: obj.theme === 'dark' ? 'dark' : 'light' };
}

