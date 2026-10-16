import { describe, expect, it } from 'vitest';
import { nextDueDate } from './time';
import { createTask, initialState } from './factory';
import { validateImported } from './validation';
import { setCalendarOccurrenceStatus } from './taskActions';
import { saveWeekReview, toggleDailyFocus } from './weekActions';

describe('PR3 selected PR2 regression fixes', () => {
  it('restores missing area definitions without reassigning saved tasks', () => {
    const task=createTask({title:'Private category',category:'Research'});
    const incoming={...initialState(),tasks:[task]};
    const result=validateImported(incoming);
    expect(result.areas.some(a=>a.id==='Research')).toBe(true);
    expect(result.tasks[0].category).toBe('Research');
  });
  it('writes an older calendar occurrence to its own period without moving the recurrence series', () => {
    const task=createTask({title:'Routine',recurrence:'daily',dueDate:'2026-10-14',scheduleAnchor:'2026-10-14'});
    const original={...initialState(),tasks:[task]};
    const next=setCalendarOccurrenceStatus(original,task.id,'finished','2026-10-15',undefined,new Date('2026-10-17T08:00:00Z'));
    expect(next.completions[0].periodKey).toBe('2026-10-15');
    expect(next.tasks[0].dueDate).toBe('2026-10-14');
    const undone=setCalendarOccurrenceStatus(next,task.id,'not-started','2026-10-15',undefined,new Date('2026-10-17T08:00:00Z'));
    expect(undone.completions).toHaveLength(0);
  });
  it('advances old recurring anchors beyond 5000 days', () => {
    expect(nextDueDate('2000-01-01','daily','2026-10-17')).toBe('2026-10-18');
    expect(nextDueDate('2000-01-01','weekly','2026-10-17') > '2026-10-17').toBe(true);
  });
  it('retains the score snapshot when an old review is edited', () => {
    const state = initialState();
    const week = '2026-10-05';
    const board = { ...state, weekPlans: { [week]: { weekStart:week,commitments:[],review:{ wins:'Original',blockers:'',adjustment:'',savedAt:'2026-10-12T00:00:00Z',scoreSnapshot:60 } } } };
    const revised = saveWeekReview(board,week,{wins:'Edited',blockers:'',adjustment:''},0,new Date('2026-10-17T00:00:00Z'));
    expect(revised.weekPlans[week].review?.scoreSnapshot).toBe(60);
  });
  it('removes stale archived focus references while selecting a new priority', () => {
    const archived=createTask({title:'Old', archivedAt:'2026-10-15T00:00:00Z'});
    const fresh=createTask({title:'New'});
    const board={...initialState(),tasks:[archived,fresh],dailyFocus:{'2026-10-17':[archived.id]}};
    const updated=toggleDailyFocus(board,'2026-10-17',fresh.id);
    expect(updated.dailyFocus['2026-10-17']).toEqual([fresh.id]);
  });
});
