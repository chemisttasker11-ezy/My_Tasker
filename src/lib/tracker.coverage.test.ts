import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask, initialState } from '../model';
import { trackerData, type TrackerOptions } from './tracker';

const options: TrackerOptions = { anchor: '2024-02-29', scale: 'day', area: 'All', includeUndated: true, includeChecklist: true, paper: 'a4' };
afterEach(() => vi.useRealTimers());

describe('tracker date and scope boundaries', () => {
  it.each([['day', 1], ['week', 7], ['month', 42], ['year', 12]] as const)('builds an empty %s tracker', (scale, count) => {
    const data = trackerData(initialState(), { ...options, scale });
    expect(data.sections).toHaveLength(count);
    expect(data.tasks).toEqual([]); expect(data.undated).toEqual([]); expect(data.occurrenceCount).toBe(0);
  });
  it('filters archived, other-area and out-of-range tasks and preserves source data', () => {
    const board = initialState();
    board.tasks = [createTask({ id: 'due', title: 'Due', category: 'Home', dueDate: '2024-02-29', scheduledTime: '00:00' }),
      createTask({ id: 'undated', title: 'Undated', category: 'Home' }),
      createTask({ title: 'Other area', category: 'Me', dueDate: '2024-02-29' }),
      createTask({ title: 'Archived', category: 'Home', dueDate: '2024-02-29', archivedAt: '2024-02-28T14:00:00Z' }),
      createTask({ title: 'Future', category: 'Home', dueDate: '2024-03-01' })];
    const before = structuredClone(board);
    const data = trackerData(board, { ...options, area: 'Home' });
    expect(data.tasks.map(t => t.id)).toEqual(['due', 'undated']);
    expect(data.sections[0].items[0]).toMatchObject({ label: '00:00 · Due', checklistCurrent: true });
    expect(data.occurrenceCount).toBe(1);
    expect(trackerData(board, { ...options, area: 'Home', includeUndated: false }).tasks.map(t => t.id)).toEqual(['due']);
    expect(trackerData(board, { ...options, area: 'Missing' }).tasks).toEqual([]);
    expect(board).toEqual(before);
  });
  it('shows a recurring checklist only for its actual due date and current undated Brisbane day', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2024-02-28T14:00:00Z'));
    const board = initialState();
    board.tasks = [createTask({ id: 'daily', title: 'Daily', recurrence: 'daily', dueDate: '2024-02-29', subtasks: [{ id: 's', title: 'Step', done: true }] }),
      createTask({ id: 'routine', title: 'Undated routine', recurrence: 'daily' })];
    const current = trackerData(board, options);
    expect(current.sections[0].items[0].checklistCurrent).toBe(true);
    expect(current.undated[0].checklistCurrent).toBe(true);
    const future = trackerData(board, { ...options, anchor: '2024-03-01' });
    expect(future.sections[0].items[0].checklistCurrent).toBe(false);
    expect(future.undated[0].checklistCurrent).toBe(false);
  });
  it('projects leap-year daily occurrences and groups them once per month for the year', () => {
    const board = initialState();
    board.tasks = [createTask({ id: 'daily', title: 'Daily', recurrence: 'daily', dueDate: '2024-01-01' })];
    board.completions = [{ id: 'c', taskId: 'daily', title: 'Daily', category: 'Me', completedAt: '2024-02-28T14:00:00Z', periodKey: '2024-02-29' }];
    const data = trackerData(board, { ...options, scale: 'year' });
    expect(data.occurrenceCount).toBe(366); expect(data.tasks).toHaveLength(1);
    expect(data.sections.every(s => s.items.length === 1)).toBe(true);
    expect(data.sections[1].items[0]).toMatchObject({ label: 'Daily · Daily 01–29 · 1/29 done', completed: false, checklistCurrent: false });
    const month = trackerData(board, { ...options, scale: 'month' });
    expect(month.sections.filter(s => s.outside)).toHaveLength(13);
    expect(month.sections.flatMap(s => s.items).find(i => i.key === 'daily-2024-02-29')?.completed).toBe(true);
  });
});
