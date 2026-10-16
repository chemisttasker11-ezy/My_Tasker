import { describe, expect, it } from 'vitest';
import { createTask, type TaskStatus } from '../model';
import { checklistTally, visibleStatus } from './progress';

describe('progress helpers', () => {
  it.each<TaskStatus>(['not-started', 'started', 'progressing', 'finished', 'postponed'])('shows %s unless completion overrides it', status => {
    const task = Object.freeze(createTask({ title: 'Progress', status }));
    expect(visibleStatus(task)).toBe(status);
    expect(visibleStatus(task, true)).toBe('finished');
    expect(task.status).toBe(status);
  });
  it('defaults legacy status and handles empty, mixed and full checklists without mutation', () => {
    const task = createTask({ title: 'Legacy' });
    expect(visibleStatus({ ...task, status: undefined } as unknown as typeof task)).toBe('not-started');
    expect(checklistTally(task)).toBeNull();
    for (const doneCount of [0, 37, 100]) {
      const full = { ...task, subtasks: Array.from({ length: 100 }, (_, i) => Object.freeze({ id: `${i}`, title: 'Step', done: i < doneCount })) };
      Object.freeze(full.subtasks); Object.freeze(full);
      expect(checklistTally(full)).toEqual({ done: doneCount, total: 100 });
      expect(full.subtasks.filter(s => s.done)).toHaveLength(doneCount);
    }
  });
});
