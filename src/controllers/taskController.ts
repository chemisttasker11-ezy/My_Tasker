import type { Dispatch, SetStateAction } from 'react';
import {
  type BoardState, type Task, type TaskStatus, type Lane, brisbaneToday,
  saveTaskChanges, setTaskStatus, moveInBoard, rescheduleTask, toggleCompletion
} from '../model';
import { setCalendarOccurrenceStatus } from '../domain/taskActions';
import { LANE_LABEL } from '../lib/display';
import { editEntry } from '../lib/planning';

/** Task-board commands own all task-level mutations and user confirmation.
 * Views remain declarative and the App only wires UI callbacks.
 */
export function createTaskController(
  board:BoardState, setBoard:Dispatch<SetStateAction<BoardState>>,
  alertNotice:(message:string)=>void, onSaved:()=>void
) {
  function saveTask(task: Task) {
    setBoard(s => saveTaskChanges(s, task));
    onSaved(); alertNotice('Task saved');
  }
  function changeStatus(id: string, status: TaskStatus, postponedTo?: string) {
    setBoard(s => setTaskStatus(s, id, status, postponedTo));
    alertNotice(status === 'postponed' ? 'Task postponed to its new date' : `Status updated`);
  }
  function changeCalendarOccurrenceStatus(id: string, status: TaskStatus, postponedTo?: string, occurrenceDate?: string) {
    if (!occurrenceDate) { changeStatus(id,status,postponedTo); return; }
    const task = board.tasks.find(t=>t.id===id);
    if (task && task.recurrence!=='none' && occurrenceDate!==brisbaneToday() &&
      status!=='finished' && status!=='not-started') {
      alertNotice('To change progress or postpone the whole recurring series, edit the source task. Calendar history supports Finished and Not started for individual past occurrences.');
      return;
    }
    setBoard(s=>setCalendarOccurrenceStatus(s,id,status,occurrenceDate,postponedTo));
    alertNotice('Calendar occurrence updated');
  }
  function rescheduleCalendarTask(id: string, date: string) {
    setBoard(s => rescheduleTask(s, id, date));
    alertNotice(date ? 'Calendar date updated' : 'Removed from calendar; still on task board');
  }
  function moveTask(id: string, lane: Lane, overId?: string) {
    setBoard(state => moveInBoard(state, id, lane, overId));
    alertNotice(`Moved to ${LANE_LABEL[lane]}`);
  }
  function archiveTask(id: string) {
    const task = board.tasks.find(t => t.id === id);
    if (!task || !window.confirm(`Archive “${task.title}”? You can restore it from Archived tasks.`)) return;
    setBoard(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, archivedAt: new Date().toISOString() } : t) }));
    alertNotice('Task archived');
  }
  function restoreArchived(id: string) {
    setBoard(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, archivedAt: '' } : t) }));
    alertNotice('Task restored');
  }
  function deleteArchived(id: string) {
    const task = board.tasks.find(t => t.id === id);
    if (!task?.archivedAt || !window.confirm(`Permanently delete “${task.title}” and its completion history? This cannot be undone.`)) return;
    setBoard(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id), completions: s.completions.filter(c => c.taskId !== id) }));
    alertNotice('Archived task deleted');
  }
  function toggleTask(id: string) {
    setBoard(s => {
      const planned = s.plannedEntries.find(e => e.id === id);
      return planned ? editEntry(s, id, { status: planned.status === 'finished' ? 'not-started' : 'finished' }) : toggleCompletion(s, id);
    });
    alertNotice('Progress updated');
  }
  function toggleSubtask(taskId: string, subtaskId: string) {
    setBoard(s => ({ ...s, tasks: s.tasks.map(t => t.id !== taskId ? t : { ...t, updatedAt: new Date().toISOString(), subtasks: t.subtasks.map(st => st.id === subtaskId ? { ...st, done: !st.done } : st) }) }));
  }

  return {
    saveTask, changeStatus, changeCalendarOccurrenceStatus, rescheduleCalendarTask, moveTask,
    archiveTask, restoreArchived, deleteArchived, toggleTask, toggleSubtask
  };
}
