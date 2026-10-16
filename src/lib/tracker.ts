import { brisbaneToday, isCompleted, type BoardState, type Task, type TaskStatus } from '../model';
import { addDays, dateTitle, dateUTC, monthDates, visibleRange, type CalendarScale } from './calendar';
import { RECUR_LABEL } from './display';
import { visibleStatus } from './progress';
import { projectSchedule, taskForPlanned } from './planProjection';

export interface TrackerItem { key: string; task: Task; label: string; status: TaskStatus; completed: boolean; checklistCurrent: boolean; planned?: boolean }
export interface TrackerSection { title: string; items: TrackerItem[]; outside?: boolean }
export interface TrackerData { title: string; scale: CalendarScale; sections: TrackerSection[]; undated: TrackerItem[]; tasks: Task[]; occurrenceCount: number }
export interface TrackerOptions { anchor: string; scale: CalendarScale; area: string; includeUndated: boolean; includeChecklist: boolean; paper: 'a4' | 'a3' }

/** Print the exact day copies visible in the planner, while retaining unmatched legacy recurring occurrences. */
export function trackerData(board: BoardState, options: TrackerOptions): TrackerData {
  const { anchor, scale, area } = options;
  const boardTasks = board.tasks.filter(t => !t.archivedAt && (area === 'All' || t.category === area));
  const range = visibleRange(anchor, scale);
  const { planned, legacy } = projectSchedule(board, range.start, range.end, area);
  const sourceById = new Map(board.tasks.map(task => [task.id, task]));
  const planTasks = planned.map(entry => ({ entry, task: taskForPlanned(entry, sourceById.get(entry.sourceTaskId)) }));
  const item = (task: Task, date: string, completed: boolean, label = task.title): TrackerItem => ({
    key: `${task.id}-${date}`, task, label, completed, status: visibleStatus(task, completed),
    checklistCurrent: task.recurrence === 'none' || date === task.dueDate
  });
  const plannedItem = (entry: typeof planned[number], task: Task, label = entry.title, checklistCurrent = true): TrackerItem => ({
    key: `planned-${entry.id}`, task, label, completed: entry.status === 'finished',
    status: entry.status, checklistCurrent, planned: true
  });
  let sections: TrackerSection[];
  if (scale === 'year') {
    sections = Array.from({ length: 12 }, (_, index) => {
      const month = `${anchor.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`;
      const legacyMonth = legacy.filter(o => o.date.startsWith(month));
      const uniqueLegacy = [...new Set(legacyMonth.map(o => o.task.id))];
      const oldItems = uniqueLegacy.map(id => {
        const dates = legacyMonth.filter(o => o.task.id === id);
        const first = dates[0];
        const sequence = dates.length > 7 ? `${dates[0].date.slice(-2)}-${dates.at(-1)!.date.slice(-2)}` : dates.map(o => Number(o.date.slice(-2))).join(', ');
        const suffix = first.task.recurrence === 'none' ? sequence : `${RECUR_LABEL[first.task.recurrence]} ${sequence} · ${dates.filter(o => o.completed).length}/${dates.length} done`;
        return { ...item(first.task, first.date, dates.every(o => o.completed), `${first.task.title} · ${suffix}`), checklistCurrent: false };
      });
      const planMonth = planTasks.filter(({entry}) => entry.date.startsWith(month));
      const bySource = new Map<string, typeof planMonth>();
      for (const pair of planMonth) bySource.set(pair.entry.sourceTaskId, [...(bySource.get(pair.entry.sourceTaskId) ?? []), pair]);
      const newItems = [...bySource.values()].map(group => {
        const first = group[0];
        const dates = group.map(({entry}) => Number(entry.date.slice(-2))).join(', ');
        const count = group.filter(({entry}) => entry.status === 'finished').length;
        const label = `${first.entry.title} · ${dates} · ${count}/${group.length} done`;
        return { ...plannedItem(first.entry, first.task, label, false), key: `planned-${month}-${first.entry.sourceTaskId}`,
          completed: count === group.length, status: (count === group.length ? 'finished' : 'not-started') as TaskStatus };
      });
      return { title: dateTitle(`${month}-01`, 'month'), items: [...newItems, ...oldItems] };
    });
  } else {
    const dates = scale === 'day' ? [anchor] : scale === 'week' ? Array.from({length:7}, (_,i) => addDays(range.start,i)) : monthDates(anchor);
    sections = dates.map(date => {
      const todayCopies = planTasks.filter(({entry}) => entry.date === date)
        .map(({entry,task}) => plannedItem(entry,task,`${entry.scheduledTime ? `${entry.scheduledTime} · ` : ''}${entry.title}`));
      const oldCopies = legacy.filter(o => o.date === date).map(o => item(o.task,date,o.completed,
        `${o.task.scheduledTime ? `${o.task.scheduledTime} · ` : ''}${o.task.title}`));
      return {
        title: new Intl.DateTimeFormat('en-AU', {weekday:'short',day:'numeric',...(scale === 'week'?{month:'short'}:{}),timeZone:'UTC'}).format(dateUTC(date)),
        outside: scale === 'month' && date.slice(0,7) !== anchor.slice(0,7),
        items: [...todayCopies, ...oldCopies]
      };
    });
  }
  const undated = options.includeUndated ? boardTasks.filter(t => !t.dueDate).map(t => ({
    ...item(t, '', isCompleted(t, board.completions, anchor), `${t.title} · ${RECUR_LABEL[t.recurrence]}`),
    checklistCurrent: t.recurrence === 'none' || anchor === brisbaneToday()
  })) : [];
  const renderedTasks = [...planTasks.map(pair => pair.task), ...boardTasks];
  const displayedIds = new Set([...sections.flatMap(s => s.items), ...undated].map(i => i.task.id));
  return { title: dateTitle(anchor,scale), scale, sections, undated,
    tasks: renderedTasks.filter(t => displayedIds.has(t.id)), occurrenceCount: planned.length + legacy.length };
}
