import { describe, expect, it } from 'vitest';
import { nextDueDate } from './time';
import { createTask, initialState } from '../model';
import { saveWeekReview, toggleDailyFocus } from './weekActions';

describe('PR3 selected PR2 regression fixes', () => {
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
