import { describe, expect, it } from 'vitest';
import { createTask, initialState, type WeeklyPlan } from '../model';
import { scoreWeek } from './scoring';

describe('weekly score boundaries', () => {
  const week = '2024-02-26';
  it('has no percentage for an absent or empty plan', () => {
    expect(scoreWeek(undefined, initialState(), week, '2024-02-29')).toMatchObject({ percent: null, planned: 0, earned: 0, possible: 0, items: [] });
    expect(scoreWeek({ weekStart: week, commitments: [], review: null }, initialState(), week, '2024-02-29').percent).toBeNull();
  });
  it.each([
    ['2024-02-25T13:59:59.999Z', 0], ['2024-02-25T14:00:00Z', 100],
    ['2024-03-03T13:59:59.999Z', 100], ['2024-03-03T14:00:00Z', 0], ['invalid', 0]
  ])('attributes completion %s to its Brisbane week', (completedAt, percent) => {
    const board = initialState(); const task = createTask({ id: 'task', title: 'Task' }); board.tasks = [task];
    board.completions = [{ id: 'c', taskId: task.id, title: task.title, category: task.category, periodKey: 'once', completedAt }];
    const plan: WeeklyPlan = { weekStart: week, commitments: [{ taskId: task.id, title: task.title, priority: 'high', plannedDate: '2024-02-29' }], review: null };
    const before = structuredClone({ board, plan });
    expect(scoreWeek(plan, board, week, '2024-02-29').percent).toBe(percent);
    expect({ board, plan }).toEqual(before);
  });
  it('weights snapshot priorities, retains missing/archived/postponed commitments and ignores live status outside the week', () => {
    const board = initialState();
    board.tasks = [createTask({ id: 'a', title: 'Progress', priority: 'low', status: 'progressing' }),
      createTask({ id: 'b', title: 'Postponed', status: 'postponed' }),
      createTask({ id: 'c', title: 'Archived', status: 'progressing', archivedAt: '2024-02-29T00:00:00Z' })];
    const plan: WeeklyPlan = { weekStart: week, review: null, commitments: ['a', 'b', 'c', 'missing'].map((taskId, i) => ({ taskId, title: taskId, priority: i === 0 ? 'high' : 'low', plannedDate: '' })) };
    const score = scoreWeek(plan, board, week, '2024-02-29');
    expect(score).toMatchObject({ percent: 30, possible: 600, earned: 180, planned: 4, postponed: 1, finished: 0 });
    expect(scoreWeek(plan, board, week, '2024-03-04').percent).toBe(0);
    expect(scoreWeek(plan, board, week, '2024-02-25').percent).toBe(0);
  });
});
