import { brisbaneToday, isCompleted, type BoardState, type Task, type TaskStatus } from '../model';
import { addDays, calendarOccurrences, dateTitle, dateUTC, monthDates, visibleRange, type CalendarScale } from './calendar';
import { RECUR_LABEL } from './display';
import { visibleStatus } from './progress';

export interface TrackerItem { key: string; task: Task; label: string; status: TaskStatus; completed: boolean; checklistCurrent: boolean }
export interface TrackerSection { title: string; items: TrackerItem[]; outside?: boolean }
export interface TrackerData { title: string; scale: CalendarScale; sections: TrackerSection[]; undated: TrackerItem[]; tasks: Task[]; occurrenceCount: number }
export interface TrackerOptions { anchor: string; scale: CalendarScale; area: string; includeUndated: boolean; includeChecklist: boolean; paper: 'a4' | 'a3' }

export function trackerData(board: BoardState, options: TrackerOptions): TrackerData {
  const { anchor, scale, area } = options;
  const tasks = board.tasks.filter(t => !t.archivedAt && (area === 'All' || t.category === area));
  const range = visibleRange(anchor, scale);
  const occurrences = calendarOccurrences(tasks, board.completions, range.start, range.end);
  const item = (task: Task, date: string, completed: boolean, label = task.title): TrackerItem => ({
    key: `${task.id}-${date}`, task, label, completed, status: visibleStatus(task, completed),
    // Only the current task's checklist is available; avoid inventing historical or future ticks.
    checklistCurrent: task.recurrence === 'none' || date === task.dueDate
  });
  let sections: TrackerSection[];
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const plannedEntries = (board.plannedEntries ?? []).filter(e => taskMap.has(e.sourceTaskId));

  const plannedItem = (entry: (typeof plannedEntries)[0]): TrackerItem => {
    const source = taskMap.get(entry.sourceTaskId)!;
    const plannedTask: Task = {
      ...source,
      title: entry.title,
      status: entry.status,
      subtasks: (entry.checklist ?? []).map(c => ({ id: c.id, title: c.title, done: c.done }))
    };
    const timePrefix = entry.startTime ? `${entry.startTime} · ` : '';
    return {
      key: `planned-${entry.id}`,
      task: plannedTask,
      label: `${timePrefix}${entry.title} · planned`,
      status: entry.status,
      completed: entry.status === 'finished',
      checklistCurrent: true
    };
  };

  const plannedForDate = (date: string): TrackerItem[] => {
    return plannedEntries
      .filter(e => e.date === date)
      .sort((a, b) => a.order - b.order || (a.createdAt || '').localeCompare(b.createdAt || ''))
      .map(plannedItem);
  };

  if (scale === 'year') {
    sections = Array.from({ length: 12 }, (_, index) => {
      const month = `${anchor.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`;
      const monthItems = occurrences.filter(o => o.date.startsWith(month));
      const unique = [...new Set(monthItems.map(o => o.task.id))];
      const dueItems = unique.map(id => {
        const entries = monthItems.filter(o => o.task.id === id);
        const first = entries[0];
        const dates = entries.length > 7 ? `${entries[0].date.slice(-2)}–${entries.at(-1)!.date.slice(-2)}` : entries.map(o => Number(o.date.slice(-2))).join(', ');
        const suffix = first.task.recurrence === 'none' ? dates : `${RECUR_LABEL[first.task.recurrence]} ${dates} · ${entries.filter(o => o.completed).length}/${entries.length} done`;
        return { ...item(first.task, first.date, entries.every(o => o.completed), `${first.task.title} · ${suffix}`), checklistCurrent: false };
      });
      const monthPlanned = plannedEntries
        .filter(e => e.date.startsWith(month))
        .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
      const plannedItems = monthPlanned.map(e => {
        const pItem = plannedItem(e);
        const dayNum = Number(e.date.slice(-2));
        return {
          ...pItem,
          label: `${e.title} · planned ${dayNum}`
        };
      });
      return { title: dateTitle(`${month}-01`, 'month'), items: [...dueItems, ...plannedItems] };
    });
  } else {
    const dates = scale === 'day' ? [anchor] : scale === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(range.start, i)) : monthDates(anchor);
    sections = dates.map(date => {
      const dueItems = occurrences.filter(o => o.date === date).map(o => item(o.task, date, o.completed, `${o.task.scheduledTime ? `${o.task.scheduledTime} · ` : ''}${o.task.title}`));
      const plannedItems = plannedForDate(date);
      return {
        title: new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', ...(scale === 'week' ? { month: 'short' } : {}), timeZone: 'UTC' }).format(dateUTC(date)),
        outside: scale === 'month' && date.slice(0, 7) !== anchor.slice(0, 7),
        items: [...dueItems, ...plannedItems]
      };
    });
  }
  const undated = options.includeUndated ? tasks.filter(t => !t.dueDate).map(t => ({
    ...item(t, '', isCompleted(t, board.completions, anchor), `${t.title} · ${RECUR_LABEL[t.recurrence]}`),
    checklistCurrent: t.recurrence === 'none' || anchor === brisbaneToday()
  })) : [];
  const displayedIds = new Set([...sections.flatMap(s => s.items), ...undated].map(i => i.task.id));
  const visiblePlannedCount = scale === 'year'
    ? plannedEntries.filter(e => e.date.startsWith(anchor.slice(0, 4))).length
    : sections.reduce((sum, s) => sum + s.items.filter(it => it.key.startsWith('planned-')).length, 0);
  return { title: dateTitle(anchor, scale), scale, sections, undated, tasks: tasks.filter(t => displayedIds.has(t.id)), occurrenceCount: occurrences.length + visiblePlannedCount };
}
