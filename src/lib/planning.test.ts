import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createTask,
  initialState,
  writeBoard,
  type BoardState,
  type Task
} from '../model';
import {
  planTask,
  copyToDays,
  moveEntry,
  reorderDay,
  removeEntry,
  setEntryStatus,
  toggleEntryItem,
  updateEntry,
  entriesForDate,
  refreshFromSource
} from './planning';
import { DayPlan, sortPlannedEntries } from '../components/planning/DayPlan';

function createFixtureBoard(): { board: BoardState; task: Task } {
  const board = initialState();
  const task = createTask({
    id: 'task-1',
    title: 'Review Quarterly Budget',
    description: 'Check variance against Q3 plan',
    lane: 'weekly',
    category: 'Money',
    dueDate: '2026-10-16',
    recurrence: 'weekly',
    scheduledTime: '10:00',
    estimateMinutes: 45,
    subtasks: [
      { id: 'sub-1', title: 'Export spreadsheet', done: false },
      { id: 'sub-2', title: 'Compare lines', done: false },
      { id: 'sub-3', title: 'Draft notes', done: false }
    ]
  });
  board.tasks = [task];
  return { board, task };
}

describe('src/lib/planning.ts pure planning functions', () => {
  describe('planTask', () => {
    it('creates an independent planned entry copy for a date without modifying the source task', () => {
      const { board, task } = createFixtureBoard();
      const updated = planTask(board, task.id, '2026-10-19');

      expect(updated.plannedEntries).toHaveLength(1);
      const entry = updated.plannedEntries![0];
      expect(entry.sourceTaskId).toBe(task.id);
      expect(entry.date).toBe('2026-10-19');
      expect(entry.title).toBe(task.title);
      expect(entry.status).toBe('not-started');
      expect(entry.startTime).toBe('10:00');
      expect(entry.durationMin).toBe(45);
      expect(entry.notes).toBe(task.description);
      expect(entry.order).toBe(0);
      expect(entry.checklist).toHaveLength(3);
      expect(entry.checklist.map(c => c.title)).toEqual([
        'Export spreadsheet',
        'Compare lines',
        'Draft notes'
      ]);
      expect(entry.checklist.every(c => !c.done)).toBe(true);

      // Source task is completely unmodified
      expect(task.dueDate).toBe('2026-10-16');
      expect(task.recurrence).toBe('weekly');
      expect(task.status).toBe('not-started');
      expect(task.completedAt).toBe('');
      expect(updated.completions).toHaveLength(0);
      expect(updated.tasks[0]).toEqual(task);
    });

    it('allows planning the same task twice on one day as two distinct entries', () => {
      const { board, task } = createFixtureBoard();
      let next = planTask(board, task.id, '2026-10-19');
      next = planTask(next, task.id, '2026-10-19');

      expect(next.plannedEntries).toHaveLength(2);
      expect(next.plannedEntries![0].id).not.toBe(next.plannedEntries![1].id);
      expect(next.plannedEntries![0].order).toBe(0);
      expect(next.plannedEntries![1].order).toBe(1);
    });

    it('supports custom options for startTime, duration, notes, and order', () => {
      const { board, task } = createFixtureBoard();
      const next = planTask(board, task.id, '2026-10-19', {
        startTime: '14:30',
        durationMin: 60,
        notes: 'Custom plan notes',
        order: 5
      });

      const entry = next.plannedEntries![0];
      expect(entry.startTime).toBe('14:30');
      expect(entry.durationMin).toBe(60);
      expect(entry.notes).toBe('Custom plan notes');
      expect(entry.order).toBe(5);
    });

    it('returns board unchanged if task not found or date invalid', () => {
      const { board, task } = createFixtureBoard();
      expect(planTask(board, 'unknown-task', '2026-10-19')).toBe(board);
      expect(planTask(board, task.id, 'not-a-date')).toBe(board);
    });
  });

  describe('copyToDays and independent copies', () => {
    it('copies a task to multiple days', () => {
      const { board, task } = createFixtureBoard();
      const next = copyToDays(board, task.id, ['2026-10-19', '2026-10-20', '2026-10-21']);

      expect(next.plannedEntries).toHaveLength(3);
      expect(next.plannedEntries!.map(e => e.date)).toEqual([
        '2026-10-19',
        '2026-10-20',
        '2026-10-21'
      ]);
    });

    it("completing Monday's copy doesn't complete Tuesday's or the source", () => {
      const { board, task } = createFixtureBoard();
      let state = copyToDays(board, task.id, ['2026-10-19', '2026-10-20']);

      const mondayEntry = state.plannedEntries!.find(e => e.date === '2026-10-19')!;
      const tuesdayEntry = state.plannedEntries!.find(e => e.date === '2026-10-20')!;

      // Complete Monday's copy
      state = setEntryStatus(state, mondayEntry.id, 'finished');
      // Tick first item on Monday's checklist
      state = toggleEntryItem(state, mondayEntry.id, mondayEntry.checklist[0].id);

      const updatedMonday = state.plannedEntries!.find(e => e.id === mondayEntry.id)!;
      const updatedTuesday = state.plannedEntries!.find(e => e.id === tuesdayEntry.id)!;

      // Monday is finished and has first item checked
      expect(updatedMonday.status).toBe('finished');
      expect(updatedMonday.checklist[0].done).toBe(true);

      // Tuesday is still not-started and has all items unchecked
      expect(updatedTuesday.status).toBe('not-started');
      expect(updatedTuesday.checklist[0].done).toBe(false);
      expect(updatedTuesday.checklist.every(c => !c.done)).toBe(true);

      // Source task in board.tasks is completely unchanged
      const sourceTask = state.tasks.find(t => t.id === task.id)!;
      expect(sourceTask.status).toBe('not-started');
      expect(sourceTask.completedAt).toBe('');
      expect(sourceTask.dueDate).toBe('2026-10-16');
      expect(sourceTask.subtasks.every(s => !s.done)).toBe(true);
      expect(state.completions).toHaveLength(0);
    });
  });

  describe('moveEntry', () => {
    it('moves an entry to another day and re-normalizes orders for both days', () => {
      const { board, task } = createFixtureBoard();
      let state = planTask(board, task.id, '2026-10-19'); // Mon entry 0
      state = planTask(state, task.id, '2026-10-19');     // Mon entry 1
      state = planTask(state, task.id, '2026-10-20');     // Tue entry 0

      const monFirst = entriesForDate(state, '2026-10-19')[0];
      state = moveEntry(state, monFirst.id, '2026-10-20', 0);

      const monEntries = entriesForDate(state, '2026-10-19');
      const tueEntries = entriesForDate(state, '2026-10-20');

      expect(monEntries).toHaveLength(1);
      expect(monEntries[0].order).toBe(0);

      expect(tueEntries).toHaveLength(2);
      expect(tueEntries[0].id).toBe(monFirst.id);
      expect(tueEntries[0].order).toBe(0);
      expect(tueEntries[1].order).toBe(1);
    });

    it('moves an entry within the same day with a target index', () => {
      const { board, task } = createFixtureBoard();
      let state = planTask(board, task.id, '2026-10-19', { notes: 'A' });
      state = planTask(state, task.id, '2026-10-19', { notes: 'B' });
      state = planTask(state, task.id, '2026-10-19', { notes: 'C' });

      const dayEntries = entriesForDate(state, '2026-10-19');
      const entryC = dayEntries[2];

      state = moveEntry(state, entryC.id, '2026-10-19', 0);
      const reordered = entriesForDate(state, '2026-10-19');

      expect(reordered.map(e => e.notes)).toEqual(['C', 'A', 'B']);
      expect(reordered.map(e => e.order)).toEqual([0, 1, 2]);
    });
  });

  describe('reorderDay', () => {
    it('reorders entries within a day', () => {
      const { board, task } = createFixtureBoard();
      let state = planTask(board, task.id, '2026-10-19', { notes: '1' });
      state = planTask(state, task.id, '2026-10-19', { notes: '2' });
      state = planTask(state, task.id, '2026-10-19', { notes: '3' });

      state = reorderDay(state, '2026-10-19', 0, 2);
      const reordered = entriesForDate(state, '2026-10-19');

      expect(reordered.map(e => e.notes)).toEqual(['2', '3', '1']);
      expect(reordered.map(e => e.order)).toEqual([0, 1, 2]);
    });

    it('returns board unchanged if indices are invalid', () => {
      const { board, task } = createFixtureBoard();
      const state = planTask(board, task.id, '2026-10-19');
      expect(reorderDay(state, '2026-10-19', -1, 0)).toBe(state);
      expect(reorderDay(state, '2026-10-19', 0, 5)).toBe(state);
      expect(reorderDay(state, '2026-10-19', 0, 0)).toBe(state);
    });
  });

  describe('removeEntry', () => {
    it('removes an entry from the plan and normalizes remaining orders', () => {
      const { board, task } = createFixtureBoard();
      let state = planTask(board, task.id, '2026-10-19', { notes: '1' });
      state = planTask(state, task.id, '2026-10-19', { notes: '2' });
      state = planTask(state, task.id, '2026-10-19', { notes: '3' });

      const middleEntry = entriesForDate(state, '2026-10-19')[1];
      state = removeEntry(state, middleEntry.id);

      const remaining = entriesForDate(state, '2026-10-19');
      expect(remaining).toHaveLength(2);
      expect(remaining.map(e => e.notes)).toEqual(['1', '3']);
      expect(remaining.map(e => e.order)).toEqual([0, 1]);

      // Source task in board.tasks is still intact
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].id).toBe(task.id);
    });
  });

  describe('setEntryStatus', () => {
    it('sets status on planned entry without modifying source task or completions', () => {
      const { board, task } = createFixtureBoard();
      let state = planTask(board, task.id, '2026-10-19');
      const entryId = state.plannedEntries![0].id;

      state = setEntryStatus(state, entryId, 'started');
      expect(state.plannedEntries![0].status).toBe('started');

      state = setEntryStatus(state, entryId, 'progressing');
      expect(state.plannedEntries![0].status).toBe('progressing');

      state = setEntryStatus(state, entryId, 'finished');
      expect(state.plannedEntries![0].status).toBe('finished');

      expect(state.tasks[0].status).toBe('not-started');
      expect(state.completions).toHaveLength(0);
    });

    it('moves entry to postponedTo date when postponing', () => {
      const { board, task } = createFixtureBoard();
      let state = planTask(board, task.id, '2026-10-19');
      const entryId = state.plannedEntries![0].id;

      state = setEntryStatus(state, entryId, 'postponed', '2026-10-22');
      const moved = state.plannedEntries!.find(e => e.id === entryId)!;

      expect(moved.status).toBe('postponed');
      expect(moved.date).toBe('2026-10-22');
      expect(entriesForDate(state, '2026-10-19')).toHaveLength(0);
      expect(entriesForDate(state, '2026-10-22')).toHaveLength(1);
    });
  });

  describe('toggleEntryItem', () => {
    it('toggles checklist items on a planned entry independently from source subtasks', () => {
      const { board, task } = createFixtureBoard();
      let state = planTask(board, task.id, '2026-10-19');
      const entry = state.plannedEntries![0];
      const item = entry.checklist[0];

      state = toggleEntryItem(state, entry.id, item.id);
      expect(state.plannedEntries![0].checklist[0].done).toBe(true);

      state = toggleEntryItem(state, entry.id, item.id);
      expect(state.plannedEntries![0].checklist[0].done).toBe(false);

      // Source subtasks remain unchanged
      expect(state.tasks[0].subtasks[0].done).toBe(false);
    });
  });

  describe('updateEntry', () => {
    it('updates title, notes, time, duration but preserves id and sourceTaskId', () => {
      const { board, task } = createFixtureBoard();
      let state = planTask(board, task.id, '2026-10-19');
      const entryId = state.plannedEntries![0].id;

      state = updateEntry(state, entryId, {
        title: 'Updated Plan Title',
        notes: 'Updated notes',
        startTime: '11:15',
        durationMin: 90
      });

      const updated = state.plannedEntries![0];
      expect(updated.id).toBe(entryId);
      expect(updated.sourceTaskId).toBe(task.id);
      expect(updated.title).toBe('Updated Plan Title');
      expect(updated.notes).toBe('Updated notes');
      expect(updated.startTime).toBe('11:15');
      expect(updated.durationMin).toBe(90);
    });
  });

  describe('refreshFromSource', () => {
    it('updates title, duration, and checklist headings while preserving existing ticks', () => {
      const { board, task } = createFixtureBoard();
      let state = planTask(board, task.id, '2026-10-19');
      const entryId = state.plannedEntries![0].id;

      // Tick the second item
      const item2Id = state.plannedEntries![0].checklist[1].id;
      state = toggleEntryItem(state, entryId, item2Id);

      // Now edit the source task: change title, estimate, and add a new subtask
      state.tasks = state.tasks.map(t => {
        if (t.id === task.id) {
          return {
            ...t,
            title: 'New Source Title',
            estimateMinutes: 75,
            subtasks: [
              { id: 'sub-1', title: 'Export spreadsheet', done: false },
              { id: 'sub-2', title: 'Compare lines', done: false },
              { id: 'sub-4', title: 'New 4th subtask', done: false }
            ]
          };
        }
        return t;
      });

      // Before refresh, the entry still has the old title and old duration
      expect(state.plannedEntries![0].title).toBe('Review Quarterly Budget');
      expect(state.plannedEntries![0].durationMin).toBe(45);

      // Explicit refresh
      state = refreshFromSource(state, entryId);
      const refreshed = state.plannedEntries![0];

      expect(refreshed.title).toBe('New Source Title');
      expect(refreshed.durationMin).toBe(75);
      expect(refreshed.checklist).toHaveLength(3);
      expect(refreshed.checklist.map(c => c.title)).toEqual([
        'Export spreadsheet',
        'Compare lines',
        'New 4th subtask'
      ]);
      // "Compare lines" was ticked and remains ticked!
      expect(refreshed.checklist[1].done).toBe(true);
      expect(refreshed.checklist[0].done).toBe(false);
      expect(refreshed.checklist[2].done).toBe(false);
    });

    it('returns board unchanged if entry or source task not found', () => {
      const { board, task } = createFixtureBoard();
      const state = planTask(board, task.id, '2026-10-19');
      expect(refreshFromSource(state, 'unknown-entry')).toBe(state);
    });
  });

  describe('entriesForDate', () => {
    it('returns entries sorted by order ascending', () => {
      const { board, task } = createFixtureBoard();
      let state = planTask(board, task.id, '2026-10-19', { order: 2 });
      state = planTask(state, task.id, '2026-10-19', { order: 0 });
      state = planTask(state, task.id, '2026-10-19', { order: 1 });
      state = planTask(state, task.id, '2026-10-20', { order: 0 });

      const sorted = entriesForDate(state, '2026-10-19');
      expect(sorted.map(e => e.order)).toEqual([0, 1, 2]);

      const otherDay = entriesForDate(state, '2026-10-20');
      expect(otherDay).toHaveLength(1);

      const emptyDay = entriesForDate(state, '2026-10-21');
      expect(emptyDay).toEqual([]);
    });
  });

  describe('review fix pass: items 1-4 and 6', () => {
    it('1. cuts copied notes and title to loader limits (250 chars) and allows successful writeBoard', () => {
      const { board, task } = createFixtureBoard();
      // Description up to 10000 is valid on a Task, but planned entry notes are capped to 250
      const longDesc = 'A'.repeat(500);
      task.description = longDesc;
      task.title = 'B'.repeat(250);

      let state = planTask(board, task.id, '2026-10-19');
      const entry = state.plannedEntries![0];
      expect(entry.notes?.length).toBe(250);
      expect(entry.notes).toBe('A'.repeat(250));
      expect(entry.title.length).toBe(250);
      expect(entry.title).toBe('B'.repeat(250));

      // updateEntry also cuts notes and title to limits
      state = updateEntry(state, entry.id, {
        notes: 'C'.repeat(320),
        title: 'D'.repeat(310)
      });
      const updated = state.plannedEntries![0];
      expect(updated.notes?.length).toBe(250);
      expect(updated.notes).toBe('C'.repeat(250));
      expect(updated.title.length).toBe(250);
      expect(updated.title).toBe('D'.repeat(250));

      // writeBoard succeeds without throwing "Board limit reached: Dropped invalid planned entry ...: invalid notes."
      const storageData: Record<string, string> = {};
      const mockStorage: Storage = {
        getItem: (k: string) => storageData[k] ?? null,
        setItem: (k: string, v: string) => { storageData[k] = v; },
        removeItem: (k: string) => { delete storageData[k]; },
        clear: () => { Object.keys(storageData).forEach(k => delete storageData[k]); },
        key: (i: number) => Object.keys(storageData)[i] ?? null,
        length: 0
      };
      expect(() => writeBoard(null, state, mockStorage)).not.toThrow();
    });

    it('2. validates dates with validISODate across planTask, moveEntry, and setEntryStatus', () => {
      const { board, task } = createFixtureBoard();
      // '2026-02-31' matches regex \d{4}-\d{2}-\d{2} but is NOT a valid calendar date
      const invalidDate = '2026-02-31';

      // planTask rejects invalid date
      const afterPlan = planTask(board, task.id, invalidDate);
      expect(afterPlan).toBe(board);
      expect(afterPlan.plannedEntries).toEqual([]);

      // create a valid entry first
      const validState = planTask(board, task.id, '2026-10-19');
      const entryId = validState.plannedEntries![0].id;

      // moveEntry rejects invalid date
      const afterMove = moveEntry(validState, entryId, invalidDate);
      expect(afterMove).toBe(validState);

      // setEntryStatus with postponedTo rejects invalid date
      const afterPostpone = setEntryStatus(validState, entryId, 'postponed', invalidDate);
      // Entry remains on original date, not moved to the invalid date
      expect(afterPostpone.plannedEntries![0].date).toBe('2026-10-19');
    });

    it('3. setEntryStatus with postponedTo re-normalizes orders on the old date without order gaps', () => {
      const { board, task } = createFixtureBoard();
      // Create 3 entries on 2026-10-19 with orders 0, 1, 2
      let state = planTask(board, task.id, '2026-10-19', { order: 0 });
      state = planTask(state, task.id, '2026-10-19', { order: 1 });
      state = planTask(state, task.id, '2026-10-19', { order: 2 });

      const middleEntryId = state.plannedEntries![1].id;
      const lastEntryId = state.plannedEntries![2].id;

      // Postpone the middle entry (order 1) to 2026-10-20
      state = setEntryStatus(state, middleEntryId, 'postponed', '2026-10-20');

      // On old date (2026-10-19), the remaining two entries MUST have orders 0 and 1 (no gaps!)
      const remainingDay1Entries = state.plannedEntries!.filter(e => e.date === '2026-10-19');
      expect(remainingDay1Entries).toHaveLength(2);
      expect(remainingDay1Entries.find(e => e.id !== lastEntryId)!.order).toBe(0);
      expect(remainingDay1Entries.find(e => e.id === lastEntryId)!.order).toBe(1);

      // On new date (2026-10-20), postponed entry has order 0 and status 'postponed'
      const day2Entries = state.plannedEntries!.filter(e => e.date === '2026-10-20');
      expect(day2Entries).toHaveLength(1);
      expect(day2Entries[0].id).toBe(middleEntryId);
      expect(day2Entries[0].order).toBe(0);
      expect(day2Entries[0].status).toBe('postponed');
    });

    it('4. caps checklist items to LIMITS.checklist (100) in planTask and refreshFromSource', () => {
      const { board, task } = createFixtureBoard();
      // Assign 110 subtasks to the source task
      task.subtasks = Array.from({ length: 110 }, (_, i) => ({
        id: `subtask-${i}`,
        title: `Step ${i}`,
        done: false
      }));

      // planTask caps to 100 items
      let state = planTask(board, task.id, '2026-10-19');
      const entryId = state.plannedEntries![0].id;
      expect(state.plannedEntries![0].checklist).toHaveLength(100);
      expect(state.plannedEntries![0].checklist[0].title).toBe('Step 0');
      expect(state.plannedEntries![0].checklist[99].title).toBe('Step 99');

      // Now add even more subtasks to the task and call refreshFromSource
      task.subtasks = Array.from({ length: 125 }, (_, i) => ({
        id: `subtask-${i}`,
        title: `Updated Step ${i}`,
        done: false
      }));
      state = refreshFromSource(state, entryId);
      expect(state.plannedEntries![0].checklist).toHaveLength(100);
      expect(state.plannedEntries![0].checklist[0].title).toBe('Updated Step 0');
      expect(state.plannedEntries![0].checklist[99].title).toBe('Updated Step 99');
    });

    it('6. DayPlan sorts entries by order itself before indexing for Move up/down', () => {
      const { task } = createFixtureBoard();
      // Provide entries in unsorted order (order 2, order 0, order 1)
      const rawEntries = [
        {
          id: 'entry-order-2',
          sourceTaskId: task.id,
          date: '2026-10-19',
          order: 2,
          status: 'not-started' as const,
          title: 'Third Item',
          checklist: [],
          createdAt: '2026-10-19T02:00:00.000Z'
        },
        {
          id: 'entry-order-0',
          sourceTaskId: task.id,
          date: '2026-10-19',
          order: 0,
          status: 'not-started' as const,
          title: 'First Item',
          checklist: [],
          createdAt: '2026-10-19T00:00:00.000Z'
        },
        {
          id: 'entry-order-1',
          sourceTaskId: task.id,
          date: '2026-10-19',
          order: 1,
          status: 'not-started' as const,
          title: 'Second Item',
          checklist: [],
          createdAt: '2026-10-19T01:00:00.000Z'
        }
      ];

      // Verify sortPlannedEntries sorts correctly by order ascending
      const sorted = sortPlannedEntries(rawEntries);
      expect(sorted.map(e => e.id)).toEqual(['entry-order-0', 'entry-order-1', 'entry-order-2']);
      expect(sorted.map(e => e.order)).toEqual([0, 1, 2]);

      // Verify rendering DayPlan in node (SSR / static markup) sorts elements before rendering
      const markup = renderToStaticMarkup(
        React.createElement(DayPlan, {
          date: '2026-10-19',
          entries: rawEntries,
          dayTitle: 'Monday'
        })
      );
      // First Item should appear before Second Item, and Second Item before Third Item
      const firstIdx = markup.indexOf('First Item');
      const secondIdx = markup.indexOf('Second Item');
      const thirdIdx = markup.indexOf('Third Item');
      expect(firstIdx).toBeGreaterThan(-1);
      expect(secondIdx).toBeGreaterThan(firstIdx);
      expect(thirdIdx).toBeGreaterThan(secondIdx);
    });
  });
});
