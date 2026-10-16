import { describe, expect, it } from 'vitest';
import { createTask, initialState, toggleCompletion } from '../model';
import { addEntry, editEntry } from './planning';
import { projectBoardSummary } from './boardSummary';

const day = '2026-10-16';
const now = new Date('2026-10-16T08:30:00.000Z');

describe('board summary: planned copies and actual completion date', () => {
  it('makes a postponed task visible when its postponed date is reached', () => {
    const task = createTask({ title:'Due again', lane:'urgent', status:'postponed', dueDate:day });
    const summary = projectBoardSummary({ ...initialState(),tasks:[task] },day);
    expect(summary.todayTasks.map(item=>item.id)).toContain(task.id);
    const futureTask = { ...task,dueDate:'2026-10-20' };
    expect(projectBoardSummary({...initialState(),tasks:[futureTask]},day).todayTasks).toHaveLength(0);
  });
  it('counts planned copies without duplicating their reusable board source', () => {
    const source = createTask({ title:'Clinical review', lane:'daily', dueDate:day });
    const baseline = { ...initialState(), tasks:[source] };
    const board = addEntry(baseline, source.id, day, now);
    const summary = projectBoardSummary(board,day);
    expect(summary.todayTasks.map(t => t.title)).toEqual(['Clinical review']);
    expect(summary.todayCopies).toHaveLength(1);
    expect(summary.doneToday).toBe(0);
  });
  it('uses actual completion date even if a task was planned yesterday', () => {
    const task = createTask({ title:'Finished later' });
    let board = addEntry({ ...initialState(), tasks:[task] }, task.id, '2026-10-15', now);
    board = editEntry(board,board.plannedEntries[0].id,{status:'finished'},now);
    expect(projectBoardSummary(board,day).doneToday).toBe(1);
    expect(projectBoardSummary(board,'2026-10-15').doneToday).toBe(0);
  });
  it('does not count re-opened planned copies as completed today', () => {
    const task = createTask({ title:'Re-opened' });
    let board = addEntry({ ...initialState(), tasks:[task] },task.id,day,now);
    const id = board.plannedEntries[0].id;
    board = editEntry(board,id,{status:'finished'},now);
    board = editEntry(board,id,{status:'progressing'},new Date('2026-10-16T09:00:00.000Z'));
    expect(projectBoardSummary(board,day).doneToday).toBe(0);
    expect(projectBoardSummary(board,day).completed(board.tasks[0])).toBe(false);
  });
  it('preserves the legacy completion history in daily totals', () => {
    const task = createTask({ title:'One-off task',lane:'daily' });
    let board = { ...initialState(),tasks:[task] };
    board=toggleCompletion(board,task.id,now);
    expect(projectBoardSummary(board,day).doneToday).toBe(1);
  });
});
