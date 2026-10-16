import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createTask,
  initialState,
  CATEGORIES,
  brisbaneToday,
  validateImported,
  loadBoard,
  STORAGE_KEY,
  type BoardState
} from '../model';
import { planTask } from '../lib/planning';
import { TodayView } from './TodayView';

function createTestBoard(): BoardState {
  const board = initialState();
  board.areas = CATEGORIES;
  board.weeklyScoreEnabled = true;
  board.onboardingStep = undefined;

  const t1 = createTask({
    id: 'task-1',
    title: 'Review quarterly goals',
    category: 'Finance',
    lane: 'urgent',
    estimateMinutes: 45,
    subtasks: [
      { id: 'sub-1', title: 'Check spreadsheet', done: false },
      { id: 'sub-2', title: 'Export summary', done: false }
    ]
  });

  const t2 = createTask({
    id: 'task-2',
    title: 'Team standup meeting',
    category: 'ChemistTasker',
    lane: 'daily',
    scheduledTime: '09:00',
    estimateMinutes: 30,
    subtasks: [{ id: 'sub-3', title: 'Prepare updates', done: true }]
  });

  const t3 = createTask({
    id: 'task-3',
    title: 'Call supplier',
    category: 'Pharmacy',
    lane: 'daily',
    scheduledTime: '14:00',
    estimateMinutes: 60
  });

  const t4 = createTask({
    id: 'task-4',
    title: 'Inbox zero triage',
    category: 'Personal',
    lane: 'urgent',
    estimateMinutes: 20
  });

  board.tasks = [t1, t2, t3, t4];
  return board;
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; }
  };
}

describe('TodayView & model loader with Finding 6 & Finding 8 seeds', () => {
  describe('1. Loader round trip (renders nothing)', () => {
    it('rejects seed when category is missing because createTask defaults to "Me" which is not in CATEGORIES', () => {
      const today = brisbaneToday();
      const board = createTestBoard();

      // Missing category defaults to 'Me' in createTask
      const lateTask = createTask({ id: 'late-task', title: 'Late evening review', scheduledTime: '23:00', estimateMinutes: 60 });
      board.tasks.push(lateTask);
      const updated = planTask(board, 'late-task', today);

      const parsed = JSON.parse(JSON.stringify(updated));
      const warnings: string[] = [];
      expect(() => validateImported(parsed, warnings)).toThrow('Backup contains invalid tasks.');
    });

    it('successfully loads Finding 6 seed with valid category through JSON round trip and validateImported', () => {
      const today = brisbaneToday();
      const board = createTestBoard();

      // Seed with 23:00 + 60 min and 04:00 + 30 min entries
      const lateTask = createTask({ id: 'late-task', title: 'Late evening review', category: 'Personal', scheduledTime: '23:00', estimateMinutes: 60 });
      const earlyTask = createTask({ id: 'early-task', title: 'Early dawn workout', category: 'Personal', scheduledTime: '04:00', estimateMinutes: 30 });
      board.tasks.push(lateTask, earlyTask);

      let updatedBoard = planTask(board, 'late-task', today);
      updatedBoard = planTask(updatedBoard, 'early-task', today);

      const raw = JSON.stringify(updatedBoard);
      const warnings: string[] = [];
      const loaded = validateImported(JSON.parse(raw), warnings);

      expect(warnings).toHaveLength(0);
      expect(loaded.plannedEntries).toBeDefined();
      expect(loaded.plannedEntries!.length).toBe(2);

      const late = loaded.plannedEntries!.find(e => e.sourceTaskId === 'late-task');
      expect(late?.startTime).toBe('23:00');
      expect(late?.durationMin).toBe(60);

      const early = loaded.plannedEntries!.find(e => e.sourceTaskId === 'early-task');
      expect(early?.startTime).toBe('04:00');
      expect(early?.durationMin).toBe(30);

      // Verify stored-board load path via loadBoard
      const storage = memoryStorage({ [STORAGE_KEY]: raw });
      const result = loadBoard(storage);
      expect(result.recovery).toBeUndefined();
      expect(result.warning).toBe('');
      expect(result.board.plannedEntries!.length).toBe(2);
    });

    it('successfully loads Finding 8 seed with valid category through JSON round trip and validateImported', () => {
      const today = brisbaneToday();
      const board = createTestBoard();

      // Seed with entry having start time but no duration (estimateMinutes = 0), and 45m normal entry
      const untimedDurationTask = createTask({
        id: 'time-only-task',
        title: 'Check server logs',
        category: 'ChemistTasker',
        scheduledTime: '11:00',
        estimateMinutes: 0
      });
      const normalTask = createTask({
        id: 'normal-task',
        title: 'Review quarterly goals',
        category: 'Finance',
        estimateMinutes: 45
      });
      board.tasks.push(untimedDurationTask, normalTask);

      let updatedBoard = planTask(board, 'time-only-task', today);
      updatedBoard = planTask(updatedBoard, 'normal-task', today);

      const raw = JSON.stringify(updatedBoard);
      const warnings: string[] = [];
      const loaded = validateImported(JSON.parse(raw), warnings);

      expect(warnings).toHaveLength(0);
      expect(loaded.plannedEntries).toBeDefined();
      expect(loaded.plannedEntries!.length).toBe(2);

      const untimed = loaded.plannedEntries!.find(e => e.sourceTaskId === 'time-only-task');
      expect(untimed?.startTime).toBe('11:00');
      expect(untimed?.durationMin).toBeUndefined();

      const normal = loaded.plannedEntries!.find(e => e.sourceTaskId === 'normal-task');
      expect(normal?.durationMin).toBe(45);

      // Verify stored-board load path via loadBoard
      const storage = memoryStorage({ [STORAGE_KEY]: raw });
      const result = loadBoard(storage);
      expect(result.recovery).toBeUndefined();
      expect(result.warning).toBe('');
      expect(result.board.plannedEntries!.length).toBe(2);
    });
  });

  describe('2. TodayView component renders without throwing', () => {
    it('renders Finding 6 entries (23:00 + 60m and 04:00 + 30m) in Early & late without throwing', () => {
      const today = brisbaneToday();
      const board = createTestBoard();

      const lateTask = createTask({ id: 'late-task', title: 'Late evening review', category: 'Personal', scheduledTime: '23:00', estimateMinutes: 60 });
      const earlyTask = createTask({ id: 'early-task', title: 'Early dawn workout', category: 'Personal', scheduledTime: '04:00', estimateMinutes: 30 });
      board.tasks.push(lateTask, earlyTask);

      let updatedBoard = planTask(board, 'late-task', today);
      updatedBoard = planTask(updatedBoard, 'early-task', today);

      const loaded = validateImported(JSON.parse(JSON.stringify(updatedBoard)));

      const html = renderToStaticMarkup(
        createElement(TodayView, {
          board: loaded,
          setBoard: vi.fn(),
          scoreEnabled: true,
          todayTasks: loaded.tasks,
          doneToday: 0,
          day: today,
          allTasks: loaded.tasks,
          focusIds: [],
          completed: () => false,
          onFocus: vi.fn(),
          navigate: vi.fn(),
          showEditor: vi.fn(),
          toggleTask: vi.fn()
        })
      );

      expect(html).toContain('Early &amp; late');
      expect(html).toContain('Late evening review');
      expect(html).toContain('Early dawn workout');
      expect(html).toContain('timeline-out-of-range');
    });

    it('renders Finding 8 entries (11:00 missing duration) as time marker without throwing or adding 30m', () => {
      const today = brisbaneToday();
      const board = createTestBoard();

      const untimedDurationTask = createTask({
        id: 'time-only-task',
        title: 'Check server logs',
        category: 'ChemistTasker',
        scheduledTime: '11:00',
        estimateMinutes: 0
      });
      const normalTask = createTask({
        id: 'normal-task',
        title: 'Review quarterly goals',
        category: 'Finance',
        estimateMinutes: 45
      });
      board.tasks.push(untimedDurationTask, normalTask);

      let updatedBoard = planTask(board, 'time-only-task', today);
      updatedBoard = planTask(updatedBoard, 'normal-task', today);

      const loaded = validateImported(JSON.parse(JSON.stringify(updatedBoard)));

      const html = renderToStaticMarkup(
        createElement(TodayView, {
          board: loaded,
          setBoard: vi.fn(),
          scoreEnabled: true,
          todayTasks: loaded.tasks,
          doneToday: 0,
          day: today,
          allTasks: loaded.tasks,
          focusIds: [],
          completed: () => false,
          onFocus: vi.fn(),
          navigate: vi.fn(),
          showEditor: vi.fn(),
          toggleTask: vi.fn()
        })
      );

      // Duration total excludes unknown duration: only 45 min planned
      expect(html).toContain('0 h 45 min planned');
      // Rendered as marker on timeline
      expect(html).toContain('timeline-marker');
      expect(html).toContain('Check server logs');
      expect(html).toContain('11:00');
    });

    it('renders entries crossing midnight (end > 24:00) without throwing', () => {
      const today = brisbaneToday();
      const board = createTestBoard();

      const midnightTask = createTask({
        id: 'midnight-task',
        title: 'Cross-midnight deployment',
        category: 'ChemistTasker',
        scheduledTime: '23:30',
        estimateMinutes: 90
      });
      board.tasks.push(midnightTask);

      let updatedBoard = planTask(board, 'midnight-task', today);
      const loaded = validateImported(JSON.parse(JSON.stringify(updatedBoard)));

      expect(() => {
        renderToStaticMarkup(
          createElement(TodayView, {
            board: loaded,
            setBoard: vi.fn(),
            scoreEnabled: true,
            todayTasks: loaded.tasks,
            doneToday: 0,
            day: today,
            allTasks: loaded.tasks,
            focusIds: [],
            completed: () => false,
            onFocus: vi.fn(),
            navigate: vi.fn(),
            showEditor: vi.fn(),
            toggleTask: vi.fn()
          })
        );
      }).not.toThrow();
    });
  });
});
