import type { BoardState, Task } from '../model';
import { brisbaneToday, isCompleted } from '../model';
import { activeItem } from './display';
import { mondayOf } from './calendar';
import { scoreWeek } from './scoring';
import { projectSchedule, taskForPlanned } from './planProjection';

/** Shared pure projection for dashboard/Today counts. Does not mutate the board,
 * write storage or depend on React lifecycle. A planned copy is independent from
 * its reusable board source and counts on actual completion time, not plan date.
 */
export function projectBoardSummary(board: BoardState, day: string) {
  const active = board.tasks.filter(activeItem);
  const completionByTask = new Map(board.plannedEntries.map(entry => [entry.id, entry.status === 'finished']));
  const completed = (task: Task) => completionByTask.get(task.id) ?? isCompleted(task, board.completions, day);

  const todaySchedule = projectSchedule(board, day, day);
  const sourceTasks = new Map(board.tasks.map(task => [task.id, task]));
  const todayCopies = todaySchedule.planned.map(entry => taskForPlanned(entry, sourceTasks.get(entry.sourceTaskId)));
  const scheduledSourceIds = new Set(todaySchedule.planned.map(entry => entry.sourceTaskId));
  const todayLegacy = active.filter(task =>
    !completed(task) && !scheduledSourceIds.has(task.id) && task.status !== 'postponed' &&
    (task.lane === 'daily' || task.lane === 'urgent' || Boolean(task.dueDate && task.dueDate <= day)));
  const todayTasks = [...todayCopies.filter(task => task.status !== 'postponed'), ...todayLegacy];
  const isCompletedOn = (isoDate: string) => !Number.isNaN(new Date(isoDate).getTime()) &&
    brisbaneToday(new Date(isoDate)) === day;
  const doneToday = board.completions.filter(entry => isCompletedOn(entry.completedAt)).length +
    board.plannedEntries.filter(entry =>
      entry.status === 'finished' && !!entry.completedAt && isCompletedOn(entry.completedAt)).length;

  const goals = active.filter(task => task.lane === 'goals');
  const weekStart = mondayOf(day);
  const currentWeekScore = scoreWeek(board.weekPlans?.[weekStart], board, weekStart, day);
  return { active, completed, todayCopies, todayTasks, doneToday, goals, currentWeekScore };
}
