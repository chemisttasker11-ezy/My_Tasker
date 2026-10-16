import { describe, expect, it } from 'vitest';
import { brisbaneToday, createTask, initialState as emptyState, CATEGORIES, isCompleted, nextDueDate, periodKey, toggleCompletion, validateImported, moveInBoard } from './model';

function initialState() {
  const board = emptyState();
  board.areas = CATEGORIES.map(a => ({ ...a }));
  board.tasks = Array.from({ length: 26 }, (_, i) => createTask({ id: `fixture-${i}`, title: i === 0 ? 'Tax' : i === 5 ? 'Family time' : `Task ${i}`, category: 'Family', lane: i === 5 ? 'daily' : i > 5 ? 'weekly' : 'urgent' }));
  return board;
}

describe('periods and recurring completion', () => {
  it('computes Australia/Brisbane date correctly', () => {
    expect(brisbaneToday(new Date('2026-10-16T01:00:00Z'))).toBe('2026-10-16');
    expect(brisbaneToday(new Date('2026-10-15T15:00:00Z'))).toBe('2026-10-16');
  });
  it('uses Monday as start of week', () => {
    expect(periodKey('weekly', '2026-10-16')).toBe('2026-10-12');
    expect(periodKey('weekly', '2026-10-18')).toBe('2026-10-12');
    expect(periodKey('weekly', '2026-10-19')).toBe('2026-10-19');
  });
  it('recognises quarterly and yearly periods', () => {
    expect(periodKey('quarterly', '2026-10-16')).toBe('2026-Q4');
    expect(periodKey('yearly', '2026-10-16')).toBe('2026');
  });
  it('logs a recurring task once per period and resets next day', () => {
    let data = initialState();
    const task = data.tasks.find(t => t.title === 'Family time')!;
    data = toggleCompletion(data, task.id, new Date('2026-10-16T01:00:00Z'));
    expect(isCompleted(task, data.completions, '2026-10-16')).toBe(true);
    expect(isCompleted(task, data.completions, '2026-10-17')).toBe(false);
    expect(data.completions).toHaveLength(1);
    data = toggleCompletion(data, task.id, new Date('2026-10-16T01:00:00Z'));
    expect(data.completions).toHaveLength(0);
  });
  it('keeps a one-time completion completed', () => {
    let data = initialState();
    const t = data.tasks.find(t => t.title === 'Tax')!;
    data = toggleCompletion(data, t.id, new Date('2026-10-16T01:00:00Z'));
    expect(isCompleted(data.tasks.find(v => v.id === t.id)!, data.completions, '2028-01-01')).toBe(true);
  });
  it('rolls monthly due dates from January 31 safely', () => {
    expect(nextDueDate('2026-01-31', 'monthly', '2026-01-31')).toBe('2026-02-28');
    expect(nextDueDate('2026-01-31', 'monthly', '2026-02-28')).toBe('2026-03-31');
  });
  it('validates backups, never executing arbitrary text', () => {
    const s = initialState();
    expect(validateImported(JSON.parse(JSON.stringify(s))).tasks.length).toBeGreaterThan(20);
    const bad = initialState();
    bad.tasks[0].category = '' as never;
    expect(() => validateImported(bad)).toThrow();
  });
  it('permits independent tasks in all six lanes', () => {
    const t = createTask({ title: 'Trial', lane: 'goals', category: 'Family' });
    expect(t.recurrence).toBe('none');
    expect(t.lane).toBe('goals');
  });
});


describe('task board ordering and undo semantics', () => {
  it('moves a notebook card into a different lane without losing its identity', () => {
    const state = initialState();
    const task = state.tasks[0];
    const next = moveInBoard(state, task.id, 'weekly');
    expect(state.tasks[0].lane).toBe('urgent');
    expect(next.tasks.find(t => t.id === task.id)?.lane).toBe('weekly');
    expect(next.tasks).toHaveLength(state.tasks.length);
    expect(next.tasks.filter(t => t.id === task.id)).toHaveLength(1);
  });
  it('reorders tasks inside the same lane', () => {
    const state = initialState();
    const first = state.tasks.find(t => t.lane === 'weekly')!;
    const last = [...state.tasks].reverse().find(t => t.lane === 'weekly')!;
    const next = moveInBoard(state, last.id, 'weekly', first.id);
    const weekly = next.tasks.filter(t => t.lane === 'weekly');
    expect(weekly[0].id).toBe(last.id);
    expect(new Set(weekly.map(t => t.id)).size).toBe(weekly.length);
  });
  it('undoes a recurring task without losing its original due date', () => {
    const state = initialState();
    const task = createTask({ title: 'Invoice review', lane: 'monthly', dueDate: '2026-10-01' });
    state.tasks.push(task);
    const now = new Date('2026-10-16T02:00:00Z');
    const completed = toggleCompletion(state, task.id, now);
    expect(completed.tasks.find(t => t.id === task.id)?.dueDate).toBe('2026-11-01');
    const undone = toggleCompletion(completed, task.id, now);
    expect(undone.tasks.find(t => t.id === task.id)?.dueDate).toBe('2026-10-01');
    expect(undone.completions).toHaveLength(0);
  });
  it('ignores unknown cards and refuses to move archived cards', () => {
    const state = initialState();
    expect(moveInBoard(state, 'unknown', 'weekly')).toBe(state);
    state.tasks[0].archivedAt = new Date().toISOString();
    expect(moveInBoard(state, state.tasks[0].id, 'daily')).toBe(state);
  });
});

describe('simple statuses, postponing and independent copies', () => {
  it('starts every notebook task as Not started and migrates old local backups', async () => {
    const { STATUS_LABEL } = await import('./lib/progress');
    const data = initialState();
    expect(data.tasks).toHaveLength(26);
    expect(data.tasks.every(t => t.status === 'not-started')).toBe(true);
    const legacy = JSON.parse(JSON.stringify(data));
    delete legacy.tasks[0].status;
    delete legacy.tasks[0].scheduledTime;
    delete legacy.tasks[0].scheduleAnchor;
    expect(validateImported(legacy).tasks[0].status).toBe('not-started');
    expect(STATUS_LABEL.progressing).toBe('Progressing');
  });
  it('moves Not started -> Started -> Progressing without creating completion records', async () => {
    const { setTaskStatus } = await import('./model');
    let state = initialState();
    const id = state.tasks[0].id;
    state = setTaskStatus(state, id, 'started');
    state = setTaskStatus(state, id, 'progressing');
    expect(state.tasks[0].status).toBe('progressing');
    expect(state.completions).toHaveLength(0);
  });
  it('requires a later date to postpone and removes a postponed task from current focus', async () => {
    const { setTaskStatus, rescheduleTask } = await import('./model');
    const now = new Date('2026-10-16T01:00:00Z');
    const state = initialState();
    const id = state.tasks[0].id;
    expect(setTaskStatus(state, id, 'postponed', '2026-10-16', now)).toBe(state);
    const postponed = setTaskStatus(state, id, 'postponed', '2026-10-24', now);
    expect(postponed.tasks[0]).toMatchObject({ status: 'postponed', dueDate: '2026-10-24', scheduleAnchor: '2026-10-24' });
    const unplanned = rescheduleTask(postponed, id, '');
    expect(unplanned.tasks[0].dueDate).toBe('');
    expect(unplanned.tasks[0].status).toBe('not-started');
  });
  it('logs Finished and undo restores previous status, due date and checklist', async () => {
    const { setTaskStatus } = await import('./model');
    const now = new Date('2026-10-16T01:00:00Z');
    let state = initialState();
    const id = state.tasks[5].id; // daily family time
    state = setTaskStatus(state, id, 'started', undefined, now);
    state = setTaskStatus(state, id, 'finished', undefined, now);
    expect(state.completions).toHaveLength(1);
    expect(isCompleted(state.tasks[5], state.completions, '2026-10-16')).toBe(true);
    expect(isCompleted(state.tasks[5], state.completions, '2026-10-17')).toBe(false);
    expect(state.tasks[5].status).toBe('not-started');
    state = setTaskStatus(state, id, 'started', undefined, now);
    expect(state.completions).toHaveLength(0);
    expect(state.tasks[5].status).toBe('started');
  });
  it('copies title and checklist headings but not identity, ticks, status or completion', async () => {
    const { duplicateTask } = await import('./model');
    const original = createTask({ title: 'Compile pharmacy reports', status: 'finished', completedAt: '2026-10-01T02:00:00Z',
      dueDate: '2026-10-21', subtasks: [{ id: 'one', title: 'Draft report', done: true }] });
    const copy = duplicateTask(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toBe('Compile pharmacy reports (copy)');
    expect(copy.status).toBe('not-started');
    expect(copy.completedAt).toBe('');
    expect(copy.subtasks[0].id).not.toBe('one');
    expect(copy.subtasks[0]).toMatchObject({ title: 'Draft report', done: false });
    expect(copy.dueDate).toBe(original.dueDate);
  });
  it('records Finished when saving an edited task, but editing its notes again does not duplicate history', async () => {
    const { saveTaskChanges } = await import('./model');
    const now = new Date('2026-10-16T01:00:00Z');
    let data = initialState();
    const task = data.tasks[0];
    data = saveTaskChanges(data, { ...task, status: 'finished', description: 'Done.' }, now);
    expect(data.completions).toHaveLength(1);
    data = saveTaskChanges(data, { ...data.tasks[0], description: 'Done, filed.' }, now);
    expect(data.completions).toHaveLength(1);
    expect(data.tasks[0].description).toBe('Done, filed.');
  });
});


import { BoardUpdateQueue, loadBoard, writeBoard, preserveRaw, STORAGE_KEY, LIMITS, saveTaskChanges, setWeekCommitment, saveWeekReview, toggleDailyFocus } from './model';
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), key: i => [...values.keys()][i] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
describe('board safety and additive migration', () => {
  it('starts fresh installs empty with neutral areas, onboarding and scores off', () => {
    const board = emptyState();
    expect(board.tasks).toEqual([]);
    expect(board.areas.map(a => a.id)).toEqual(['Home', 'Health', 'Work', 'People', 'Money', 'Me']);
    expect(board.weeklyScoreEnabled).toBe(false); expect(board.onboardingStep).toBe(1);
  });
  it.each(['{broken', JSON.stringify({ version: 2, tasks: [], completions: [] })])('preserves unsupported or corrupt raw data without overwriting it: %s', raw => {
    const storage = memoryStorage(); storage.setItem(STORAGE_KEY, raw);
    expect(loadBoard(storage).recovery).toBeTruthy();
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
    const recoveryKey = Array.from({ length: storage.length }, (_, i) => storage.key(i)!).find(key => key.startsWith(`${STORAGE_KEY}:recovery-`))!;
    expect(storage.getItem(recoveryKey)).toBe(raw);
  });
  it('exposes storage read and recovery-copy failures', () => {
    const storage = memoryStorage(); storage.setItem(STORAGE_KEY, 'bad');
    storage.setItem = () => { throw new Error('quota'); };
    expect(loadBoard(storage)).toMatchObject({ storageError: true, raw: 'bad' });
    storage.getItem = () => { throw new Error('blocked'); };
    expect(loadBoard(storage).storageError).toBe(true);
  });
  it('trims oversized checklists with a warning and backs up raw before migration writes', () => {
    const storage = memoryStorage(); const board = emptyState();
    board.tasks = [createTask({ title: 'Keep me', subtasks: Array.from({ length: 101 }, (_, i) => ({ id: `s${i}`, title: 'Step', done: false })) })];
    const raw = JSON.stringify(board); storage.setItem(STORAGE_KEY, raw);
    const loaded = loadBoard(storage);
    expect(loaded.recovery).toBeUndefined(); expect(loaded.warning).toContain('Checklist');
    expect(loaded.board.tasks[0].subtasks).toHaveLength(100);
    writeBoard(raw, loaded.board, storage);
    expect(Array.from({ length: storage.length }, (_, i) => storage.key(i)!).some(key => key.includes(':backup-') && storage.getItem(key) === raw)).toBe(true);
  });
  it('enforces checklist and collection limits while editing', () => {
    const state = emptyState(); const task = createTask({ title: 'Checklist' }); state.tasks = [task];
    const draft = { ...task, subtasks: Array.from({ length: 101 }, (_, i) => ({ id: `${i}`, title: 'Step', done: false })) };
    const storage = memoryStorage();
    const saved = writeBoard(null, saveTaskChanges(state, draft), storage);
    expect(saved.board.tasks[0].subtasks).toHaveLength(LIMITS.checklist);
    expect(saved.warnings.length).toBeGreaterThan(0);
    state.tasks = Array.from({ length: LIMITS.tasks }, (_, i) => ({ ...task, id: `${i}` }));
    expect(saveTaskChanges(state, { ...task, id: 'new' })).toBe(state);
    state.dailyFocus = Object.fromEntries(Array.from({ length: LIMITS.focusDates }, (_, i) => [`old${i}`, []]));
    expect(toggleDailyFocus(state, '2026-10-16', '0')).toBe(state);
    state.weekPlans = Object.fromEntries(Array.from({ length: LIMITS.weeks }, (_, i) => [`old${i}`, { weekStart: '', commitments: [], review: null }]));
    expect(setWeekCommitment(state, '2026-10-12', task, true)).toBe(state);
  });
  it('increments revisions and refuses stale writes without reapplying edits', () => {
    const storage = memoryStorage(); const first = writeBoard(null, emptyState(), storage);
    const second = writeBoard(first.raw, { ...first.board, theme: 'dark' }, storage);
    expect(second.board.revision).toBe(2);
    expect(() => writeBoard(first.raw, { ...first.board, tasks: [createTask({ title: 'Stale' })] }, storage)).toThrow('conflict');
    expect(loadBoard(storage).board.tasks).toEqual([]); expect(storage.getItem(STORAGE_KEY)).toBe(second.raw);
  });
  it('backs up the exact current payload and exposes write failures', () => {
    const storage = memoryStorage(); const raw = JSON.stringify(initialState()); storage.setItem(STORAGE_KEY, raw);
    const key = preserveRaw(raw, 'backup', storage); expect(storage.getItem(key)).toBe(raw);
    expect(preserveRaw('second', 'backup', storage)).not.toBe(key);
    storage.setItem = () => { throw new Error('quota'); };
    expect(() => writeBoard(raw, initialState(), storage)).toThrow('quota');
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });
  it.each(['createdAt', 'updatedAt', 'completedAt', 'archivedAt'])('rejects nonfinite task %s timestamps', field => {
    const board = initialState(); (board.tasks[0] as unknown as Record<string, unknown>)[field] = 'not-a-date';
    expect(() => validateImported(board)).toThrow('invalid tasks');
  });
  it('rejects nonfinite completion and review timestamps', () => {
    let board = initialState(); board = toggleCompletion(board, board.tasks[0].id);
    board.completions[0].completedAt = 'not-a-date'; expect(() => validateImported(board)).toThrow('history');
    board = initialState(); board = setWeekCommitment(board, '2026-10-12', board.tasks[0], true);
    board = saveWeekReview(board, '2026-10-12', { wins: '', blockers: '', adjustment: '' }, 60);
    board.weekPlans['2026-10-12'].review!.savedAt = 'not-a-date'; expect(() => validateImported(board)).toThrow('review');
  });
  it('regenerates duplicate checklist IDs including after truncation', () => {
    const board = emptyState(); board.tasks = [createTask({ title: 'Steps', subtasks: ['same', 'same', 'x'.repeat(101), 'x'.repeat(102)].map(id => ({ id, title: 'Step', done: false })) })];
    const imported = validateImported(board); expect(new Set(imported.tasks[0].subtasks.map(s => s.id)).size).toBe(4);
  });
  it('migrates an original backup without areas and retains tasks, history and legacy areas', () => {
    let board = initialState(); board = toggleCompletion(board, board.tasks[0].id);
    const old = { ...board, areas: undefined, weekPlans: undefined, dailyFocus: undefined, weeklyScoreEnabled: undefined, revision: undefined, onboardingStep: undefined };
    const imported = validateImported(old);
    expect(imported.tasks).toEqual(board.tasks); expect(imported.completions).toEqual(board.completions);
    expect(imported.areas).toEqual(CATEGORIES); expect(imported.onboardingStep).toBeUndefined();
    const storage = memoryStorage(); storage.setItem(STORAGE_KEY, JSON.stringify(old)); expect(loadBoard(storage).board.tasks).toEqual(board.tasks);
  });
  it('enables score for legacy commitments/reviews and preserves data when explicitly disabled', () => {
    let board = initialState(); board = setWeekCommitment(board, '2026-10-12', board.tasks[0], true);
    board = saveWeekReview(board, '2026-10-12', { wins: 'Kept', blockers: '', adjustment: '' }, 60);
    expect(validateImported({ ...board, weeklyScoreEnabled: undefined }).weeklyScoreEnabled).toBe(true);
    expect(validateImported({ ...board, weeklyScoreEnabled: false }).weekPlans).toEqual(board.weekPlans);
    expect(validateImported({ ...board, weeklyScoreEnabled: false }).weeklyScoreEnabled).toBe(false);
    board.weekPlans['2026-10-12'].commitments = [];
    expect(validateImported({ ...board, weeklyScoreEnabled: undefined }).weeklyScoreEnabled).toBe(true);
  });
  it('clears completedAt when reopening a finished task in the editor', () => {
    const state = initialState(); const done = toggleCompletion(state, state.tasks[0].id);
    const reopened = saveTaskChanges(done, { ...done.tasks[0], status: 'started' });
    expect(reopened.tasks[0].completedAt).toBe(''); expect(reopened.completions).toEqual([]);
  });
  it('releases archived focus slots, removes missing commitments and preserves past review scores', () => {
    let state = initialState(); const date = '2026-10-16';
    state.dailyFocus[date] = state.tasks.slice(0, 3).map(t => t.id); state.tasks[0].archivedAt = new Date().toISOString();
    state = toggleDailyFocus(state, date, state.tasks[3].id); expect(state.dailyFocus[date]).toHaveLength(3); expect(state.dailyFocus[date]).not.toContain(state.tasks[0].id);
    state = setWeekCommitment(state, '2026-10-12', state.tasks[1], true);
    state = saveWeekReview(state, '2026-10-12', { wins: 'First', blockers: '', adjustment: '' }, 60, new Date('2026-10-16T00:00Z'));
    state = saveWeekReview(state, '2026-10-12', { wins: 'Edited', blockers: '', adjustment: '' }, 0, new Date('2026-11-01T00:00Z'));
    expect(state.weekPlans['2026-10-12'].review?.scoreSnapshot).toBe(60);
    const deleted = state.tasks[1]; state.tasks = state.tasks.filter(t => t.id !== deleted.id);
    state = setWeekCommitment(state, '2026-10-12', deleted, false); expect(state.weekPlans['2026-10-12'].commitments).toEqual([]);
  });
  it('advances decades-old recurrence anchors past the target', () => {
    expect(nextDueDate('2000-01-01', 'daily', '2026-10-16')).toBe('2026-10-17');
    expect(nextDueDate('2000-01-31', 'monthly', '2026-10-16')).toBe('2026-10-31');
  });
});


describe('task editor conflict rule', () => {
  it('detects changes to an edited task after another tab advances the revision', async () => {
    const { taskEditConflicts } = await import('./model');
    const board = emptyState(); const task = createTask({ title: 'Original' }); board.tasks = [task]; board.revision = 5;
    const snapshot = { revision: 5, task };
    const theirs = { ...task, title: 'Their title' };
    expect(taskEditConflicts(snapshot, { ...board, revision: 6, tasks: [theirs] }, task.id)).toBe(true);
    expect(taskEditConflicts(snapshot, { ...board, revision: 6, tasks: [{ ...task, subtasks: [{ id: 'step', title: 'New step', done: true }] }] }, task.id)).toBe(true);
    expect(taskEditConflicts(snapshot, { ...board, revision: 6, tasks: [] }, task.id)).toBe(true);
    expect(task.title).toBe('Original');
  });
  it('allows an unchanged task when unrelated board changes advance the revision', async () => {
    const { taskEditConflicts } = await import('./model');
    const task = createTask({ title: 'Original' }); const board = { ...emptyState(), revision: 7, tasks: [task] };
    const snapshot = { revision: 7, task };
    expect(taskEditConflicts(snapshot, board, task.id)).toBe(false);
    expect(taskEditConflicts(snapshot, { ...board, revision: 8, theme: 'dark', tasks: [{ ...task }, createTask({ title: 'Other task' })] }, task.id)).toBe(false);
  });
  it('supports legacy tabs and checks for another change after Use mine was offered', async () => {
    const { taskEditConflicts } = await import('./model');
    const task = createTask({ title: 'Original' }); const theirs = { ...task, title: 'Theirs' };
    const board = { ...emptyState(), revision: 0, tasks: [theirs] };
    expect(taskEditConflicts({ revision: 0, task }, board, task.id)).toBe(true);
    const acknowledged = { revision: 0, task: theirs };
    expect(taskEditConflicts(acknowledged, board, task.id)).toBe(false);
    expect(taskEditConflicts(acknowledged, { ...board, revision: 1, tasks: [{ ...theirs, description: 'Changed again' }] }, task.id)).toBe(true);
  });
  it('does not conflict for a new task or a duplicate unless its ID already exists', async () => {
    const { taskEditConflicts } = await import('./model');
    const task = createTask({ title: 'New' }); const snapshot = { revision: 0, task: null };
    expect(taskEditConflicts(snapshot, { ...emptyState(), revision: 2 }, task.id)).toBe(false);
    expect(taskEditConflicts(snapshot, { ...emptyState(), revision: 2, tasks: [task] }, task.id)).toBe(true);
  });
});


describe('immediate same-tab updates with serialized persistence', () => {
  it('updates the score checkbox immediately after onboarding and starters, before the storage lock resolves', async () => {
    const { addLifeTemplates, STARTER_IDS } = await import('./lib/lifeLibrary');
    const storage = memoryStorage();
    let raw: string | null = null;
    let rendered = emptyState();
    const updates = new BoardUpdateQueue(rendered, board => { rendered = board; });
    const edit = (action: (board: typeof rendered) => typeof rendered, wait = Promise.resolve()) => {
      const next = action(updates.current);
      updates.enqueue(next, async () => {
        await wait;
        const saved = writeBoard(raw, next, storage);
        raw = saved.raw;
        return saved.board;
      }, () => { throw new Error('Unexpected storage failure'); });
    };
    edit(board => ({ ...board, onboardingStep: 2 })); await updates.whenIdle();
    edit(board => ({ ...board, onboardingStep: undefined })); await updates.whenIdle();
    edit(board => addLifeTemplates(board, STARTER_IDS)); await updates.whenIdle();
    expect(rendered.tasks).toHaveLength(12);
    let release!: () => void;
    const lock = new Promise<void>(resolve => { release = resolve; });
    edit(board => ({ ...board, weeklyScoreEnabled: true }), lock);
    // React must receive the new checked value in the change event, not after the Web Lock.
    expect(rendered.weeklyScoreEnabled).toBe(true);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).weeklyScoreEnabled).toBe(false);
    release(); await updates.whenIdle();
    expect(loadBoard(storage).board.weeklyScoreEnabled).toBe(true);
    expect(loadBoard(storage).board.tasks).toHaveLength(12);
  });
  it('does not roll back later local edits when an earlier queued write finishes', async () => {
    const storage = memoryStorage(); let raw: string | null = null; let rendered = emptyState();
    const updates = new BoardUpdateQueue(rendered, board => { rendered = board; });
    const first = { ...updates.current, weeklyScoreEnabled: true };
    let release!: () => void;
    const lock = new Promise<void>(resolve => { release = resolve; });
    const persisted: number[] = [];
    updates.enqueue(first, async () => {
      await lock; const saved = writeBoard(raw, first, storage); raw = saved.raw;
      persisted.push(saved.board.revision!); return saved.board;
    }, () => { throw new Error('Unexpected failure'); });
    const second = { ...updates.current, theme: 'dark' as const, tasks: [createTask({ title: 'Keep this edit' })] };
    updates.enqueue(second, async () => {
      expect(rendered).toBe(second);
      const saved = writeBoard(raw, second, storage); raw = saved.raw;
      persisted.push(saved.board.revision!); return saved.board;
    }, () => { throw new Error('Unexpected failure'); });
    expect(rendered).toBe(second); release(); await updates.whenIdle();
    expect(persisted).toEqual([1, 2]);
    expect(rendered).toMatchObject({ theme: 'dark', weeklyScoreEnabled: true, revision: 2 });
    expect(loadBoard(storage).board.tasks[0].title).toBe('Keep this edit');
  });
  it('keeps an external reload when a pending local write encounters a conflict', async () => {
    const storage = memoryStorage(); const first = writeBoard(null, emptyState(), storage);
    let rendered = first.board; const updates = new BoardUpdateQueue(rendered, board => { rendered = board; });
    const theirs = writeBoard(first.raw, { ...first.board, theme: 'dark' }, storage);
    let rejected = false;
    updates.enqueue({ ...first.board, weeklyScoreEnabled: true }, async () => {
      try { return writeBoard(first.raw, updates.current, storage).board; }
      catch { rejected = true; updates.replace(loadBoard(storage).board); return undefined; }
    }, () => { throw new Error('Unexpected failure'); });
    await updates.whenIdle();
    expect(rejected).toBe(true);
    expect(rendered).toEqual(theirs.board);
    expect(storage.getItem(STORAGE_KEY)).toBe(theirs.raw);
  });
});


describe('recoverable over-limit saves', () => {
  it('saves unrelated edits and a trimmed checklist while preserving the untrimmed next board', () => {
    const storage = memoryStorage(); const initial = writeBoard(null, emptyState(), storage);
    const next = { ...initial.board, theme: 'dark' as const, weeklyScoreEnabled: true, tasks: [createTask({
      title: 'Keep my title edit', subtasks: Array.from({ length: 101 }, (_, i) => ({ id: `s${i}`, title: `Step ${i}`, done: false }))
    })] };
    const saved = writeBoard(initial.raw, next, storage);
    expect(saved.board).toMatchObject({ theme: 'dark', weeklyScoreEnabled: true, revision: 2 });
    expect(saved.board.tasks[0].title).toBe('Keep my title edit');
    expect(saved.board.tasks[0].subtasks).toHaveLength(100);
    expect(saved.warnings.join(' ')).toContain('Checklist');
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)!);
    const recovery = keys.find(key => key.startsWith(`${STORAGE_KEY}:recovery-`))!;
    expect(storage.getItem(recovery)).toBe(JSON.stringify(next));
    expect(JSON.parse(storage.getItem(recovery)!).tasks[0].subtasks).toHaveLength(101);
    const later = writeBoard(saved.raw, { ...saved.board, theme: 'light' }, storage);
    expect(later.board.theme).toBe('light'); expect(later.warnings).toEqual([]);
    expect(loadBoard(storage).board).toEqual(later.board);
  });
  it('does not overwrite saved data if the required recovery copy fails', () => {
    const storage = memoryStorage(); const initial = writeBoard(null, emptyState(), storage);
    const next = { ...initial.board, tasks: [createTask({ title: 'Steps', subtasks: Array.from({ length: 101 }, (_, i) => ({ id: `${i}`, title: 'Step', done: false })) })] };
    const setItem = storage.setItem;
    storage.setItem = (key, value) => { if (key.includes(':recovery-')) throw new Error('quota'); setItem(key, value); };
    expect(() => writeBoard(initial.raw, next, storage)).toThrow('quota');
    expect(storage.getItem(STORAGE_KEY)).toBe(initial.raw);
  });
});
describe('plannedEntries backward-compatibility, migration and validation', () => {
  it('loads old saved boards and old backups without plannedEntries field unchanged, defaulting plannedEntries to []', () => {
    const oldBoard = initialState();
    // Simulate legacy board created before plannedEntries was introduced
    delete (oldBoard as { plannedEntries?: unknown }).plannedEntries;
    expect((oldBoard as { plannedEntries?: unknown }).plannedEntries).toBeUndefined();

    const warnings: string[] = [];
    const migrated = validateImported(JSON.parse(JSON.stringify(oldBoard)), warnings);
    expect(migrated.plannedEntries).toEqual([]);
    expect(warnings).toEqual([]);
    expect(migrated.tasks.length).toBe(oldBoard.tasks.length);
    expect(migrated.completions).toEqual(oldBoard.completions);

    // Stored-board loader also handles legacy boards without plannedEntries
    const mockStorage: Storage = {
      getItem: (key: string) => key === STORAGE_KEY ? JSON.stringify(oldBoard) : null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 1
    };
    const loaded = loadBoard(mockStorage);
    expect(loaded.board.plannedEntries).toEqual([]);
    expect(loaded.warning).toBe('');
    expect(loaded.recovery).toBeUndefined();
  });

  it('validates planned entries within limits, trimming extra entries over 5000 with a warning', () => {
    const board = initialState();
    const taskId = board.tasks[0].id;
    board.plannedEntries = Array.from({ length: 5005 }, (_, i) => ({
      id: `plan-${i}`,
      sourceTaskId: taskId,
      date: '2026-10-19',
      order: i,
      status: 'not-started',
      title: `Plan ${i}`,
      checklist: [{ id: `item-${i}`, title: 'Step', done: false }],
      createdAt: new Date().toISOString()
    }));

    const warnings: string[] = [];
    const validated = validateImported(board, warnings);
    expect(validated.plannedEntries?.length).toBe(5000);
    expect(warnings.some(w => w.includes('Planned entries exceeded 5000'))).toBe(true);
  });

  it('trims checklist items over 100 with a warning', () => {
    const board = initialState();
    const taskId = board.tasks[0].id;
    board.plannedEntries = [{
      id: 'plan-with-many-items',
      sourceTaskId: taskId,
      date: '2026-10-19',
      order: 0,
      status: 'not-started',
      title: 'Dense Plan',
      checklist: Array.from({ length: 110 }, (_, i) => ({ id: `c-${i}`, title: `Item ${i}`, done: false })),
      createdAt: new Date().toISOString()
    }];

    const warnings: string[] = [];
    const validated = validateImported(board, warnings);
    expect(validated.plannedEntries?.[0].checklist.length).toBe(100);
    expect(warnings.some(w => w.includes('checklist exceeded 100'))).toBe(true);
  });

  it('drops invalid planned entries with a warning, goes through JSON.parse, and prevents prototype pollution from __proto__ / constructor keys', () => {
    const board = initialState();
    const validTaskId = board.tasks[0]?.id ?? 'task-1';
    const rawPayload = JSON.stringify({
      version: 1,
      revision: 0,
      tasks: board.tasks,
      completions: [],
      weekPlans: {},
      dailyFocus: {},
      areas: board.areas,
      theme: 'light',
      plannedEntries: [
        // 1. Valid entry
        {
          id: 'valid-entry-1',
          sourceTaskId: validTaskId,
          date: '2026-10-19',
          order: 0,
          startTime: '09:30',
          durationMin: 45,
          status: 'started',
          title: 'Valid task copy',
          checklist: [{ id: 'chk-1', title: 'First step', done: true }],
          notes: 'Some notes',
          createdAt: '2026-10-19T00:00:00.000Z'
        },
        // 2. Invalid date
        {
          id: 'bad-date',
          sourceTaskId: validTaskId,
          date: 'invalid-date',
          order: 1,
          status: 'not-started',
          title: 'Bad date',
          checklist: [],
          createdAt: '2026-10-19T00:00:00.000Z'
        },
        // 3. String over 250 characters
        {
          id: 'too-long-title',
          sourceTaskId: validTaskId,
          date: '2026-10-19',
          order: 2,
          status: 'not-started',
          title: 'x'.repeat(251),
          checklist: [],
          createdAt: '2026-10-19T00:00:00.000Z'
        },
        // 4. Invalid status
        {
          id: 'bad-status',
          sourceTaskId: validTaskId,
          date: '2026-10-19',
          order: 3,
          status: 'non-existent-status',
          title: 'Bad status',
          checklist: [],
          createdAt: '2026-10-19T00:00:00.000Z'
        },
        // 5. Invalid time
        {
          id: 'bad-time',
          sourceTaskId: validTaskId,
          date: '2026-10-19',
          order: 4,
          startTime: '99:99',
          status: 'not-started',
          title: 'Bad time',
          checklist: [],
          createdAt: '2026-10-19T00:00:00.000Z'
        },
        // 6. Invalid checklist (item has non-boolean done)
        {
          id: 'bad-checklist',
          sourceTaskId: validTaskId,
          date: '2026-10-19',
          order: 5,
          status: 'not-started',
          title: 'Bad checklist',
          checklist: [{ id: 'bad-item', title: 'Item', done: 'yes' }],
          createdAt: '2026-10-19T00:00:00.000Z'
        }
      ]
    });

    // Splice in "__proto__" and "constructor" keys into the JSON payload
    const maliciousJson = rawPayload.replace(
      '"plannedEntries":[',
      '"__proto__":{"pollutedTopLevel":"yes"},"constructor":{"prototype":{"pollutedCtor":"yes"}},"plannedEntries":[{"id":"proto-entry","sourceTaskId":"' +
        validTaskId +
        '","date":"2026-10-19","order":6,"status":"not-started","title":"Proto injection","checklist":[],"__proto__":{"pollutedEntry":"yes"},"constructor":{"prototype":{"pollutedEntryCtor":"yes"}}},'
    );

    const parsed = JSON.parse(maliciousJson);

    const warnings: string[] = [];
    const validated = validateImported(parsed, warnings);

    // Verify prototype pollution was prevented
    expect(({} as Record<string, unknown>).pollutedTopLevel).toBeUndefined();
    expect(({} as Record<string, unknown>).pollutedCtor).toBeUndefined();
    expect(({} as Record<string, unknown>).pollutedEntry).toBeUndefined();
    expect(({} as Record<string, unknown>).pollutedEntryCtor).toBeUndefined();
    expect(Object.prototype.hasOwnProperty('pollutedTopLevel')).toBe(false);
    expect(Object.prototype.hasOwnProperty('pollutedCtor')).toBe(false);
    expect(Object.prototype.hasOwnProperty('pollutedEntry')).toBe(false);
    expect(Object.prototype.hasOwnProperty('pollutedEntryCtor')).toBe(false);

    // Board was NOT rejected: all tasks are intact
    expect(validated.tasks.length).toBe(board.tasks.length);
    // Only valid entries are kept, invalid ones dropped with warnings
    const keptIds = validated.plannedEntries?.map(e => e.id) ?? [];
    expect(keptIds).toContain('valid-entry-1');
    expect(keptIds).not.toContain('bad-date');
    expect(keptIds).not.toContain('too-long-title');
    expect(keptIds).not.toContain('bad-status');
    expect(keptIds).not.toContain('bad-time');
    expect(keptIds).not.toContain('bad-checklist');
    expect(warnings.length).toBeGreaterThanOrEqual(5);
  });
});

describe('repair missing areas instead of rejecting board', () => {
  it('legacy areas + task in Me loads with Me appended', () => {
    const storage = memoryStorage();
    const board = emptyState();
    board.areas = CATEGORIES.map(a => ({ ...a }));
    board.tasks = [createTask({ title: 'Task in Me', category: 'Me' })];
    const raw = JSON.stringify(board);
    storage.setItem(STORAGE_KEY, raw);

    const loaded = loadBoard(storage);
    expect(loaded.recovery).toBeUndefined();
    expect(loaded.warning).toContain('Restored missing area: Me');
    expect(loaded.board.areas.map(a => a.id)).toEqual([...CATEGORIES.map(a => a.id), 'Me']);
    expect(loaded.board.tasks[0].category).toBe('Me');
  });

  it('an import with an unknown area keeps all tasks', () => {
    const board = emptyState();
    board.tasks = [
      createTask({ title: 'Task in unknown area', category: 'Astronomy' }),
      createTask({ title: 'Task in personal', category: 'Personal' }),
    ];
    const warnings: string[] = [];
    const imported = validateImported(JSON.parse(JSON.stringify(board)), warnings);
    expect(imported.tasks).toHaveLength(2);
    expect(imported.tasks[0].title).toBe('Task in unknown area');
    expect(imported.tasks[0].category).toBe('Astronomy');
    expect(imported.tasks[1].title).toBe('Task in personal');
    expect(imported.tasks[1].category).toBe('Personal');
    expect(imported.areas.map(a => a.id)).toContain('Astronomy');
    expect(warnings).toContain('Restored missing area: Astronomy');
  });

  it('the repaired board round-trips with zero warnings', () => {
    const storage = memoryStorage();
    const board = emptyState();
    board.areas = CATEGORIES.map(a => ({ ...a }));
    board.tasks = [createTask({ title: 'Task in Me', category: 'Me' })];
    const raw = JSON.stringify(board);
    storage.setItem(STORAGE_KEY, raw);

    // First load repairs missing area and records a warning
    const loaded = loadBoard(storage);
    expect(loaded.board.areas.map(a => a.id)).toContain('Me');
    expect(loaded.warning).toContain('Restored missing area: Me');

    // Saving the repaired board persists cleanly
    const saved = writeBoard(raw, loaded.board, storage);
    expect(saved.warnings).toEqual([]);

    // Stored-board load of the saved board has zero warnings
    const reloaded = loadBoard(storage);
    expect(reloaded.warning).toBe('');
    expect(reloaded.recovery).toBeUndefined();
    expect(reloaded.board.areas.map(a => a.id)).toContain('Me');

    // Re-validating the reloaded board has zero warnings
    const revalidatedWarnings: string[] = [];
    const revalidated = validateImported(JSON.parse(JSON.stringify(reloaded.board)), revalidatedWarnings);
    expect(revalidatedWarnings).toEqual([]);
    expect(revalidated.areas.map(a => a.id)).toContain('Me');

    // A later save doesn't create any new recovery copy
    const recoveryCountBefore = Array.from({ length: storage.length }, (_, i) => storage.key(i)!)
      .filter(k => k.startsWith(`${STORAGE_KEY}:recovery-`)).length;
    const laterSave = writeBoard(saved.raw, { ...saved.board, theme: 'dark' }, storage);
    expect(laterSave.warnings).toEqual([]);
    const recoveryCountAfter = Array.from({ length: storage.length }, (_, i) => storage.key(i)!)
      .filter(k => k.startsWith(`${STORAGE_KEY}:recovery-`)).length;
    expect(recoveryCountAfter).toBe(recoveryCountBefore);
  });

  it('restores missing area from completions, deduplicating case-sensitively and keeping existing order', () => {
    const board = emptyState();
    board.areas = CATEGORIES.map(a => ({ ...a }));
    const task = createTask({ title: 'Task 1', category: 'NewArea' });
    board.tasks = [task, createTask({ title: 'Task 2', category: 'NewArea' })];
    board.completions = [
      { id: 'c1', taskId: task.id, title: task.title, category: 'NewArea', completedAt: '2026-10-16T01:00:00Z', periodKey: 'once' },
      { id: 'c2', taskId: task.id, title: task.title, category: 'AnotherArea', completedAt: '2026-10-16T01:00:00Z', periodKey: 'once' }
    ];
    const warnings: string[] = [];
    const imported = validateImported(JSON.parse(JSON.stringify(board)), warnings);
    expect(imported.tasks).toHaveLength(2);
    expect(imported.completions).toHaveLength(2);
    // Preserves existing categories order and appends restored areas
    expect(imported.areas.map(a => a.id)).toEqual([...CATEGORIES.map(a => a.id), 'NewArea', 'AnotherArea']);
    // Deduplicated: NewArea warning appears only once despite 2 tasks and 1 completion
    expect(warnings.filter(w => w === 'Restored missing area: NewArea')).toHaveLength(1);
    expect(warnings.filter(w => w === 'Restored missing area: AnotherArea')).toHaveLength(1);
  });

  it('restores missing area from plannedEntries and templates', () => {
    const board = emptyState();
    board.areas = CATEGORIES.map(a => ({ ...a }));
    const raw = {
      ...board,
      plannedEntries: [
        {
          id: 'p1',
          sourceTaskId: 't1',
          date: '2026-10-19',
          order: 0,
          status: 'not-started',
          title: 'Planned task',
          checklist: [],
          category: 'PlannedArea'
        }
      ],
      templates: [
        {
          id: 'tmpl-1',
          title: 'Template task',
          category: 'TemplateArea'
        }
      ]
    };
    const warnings: string[] = [];
    const imported = validateImported(raw, warnings);
    expect(imported.areas.map(a => a.id)).toContain('PlannedArea');
    expect(imported.areas.map(a => a.id)).toContain('TemplateArea');
    expect(warnings).toContain('Restored missing area: PlannedArea');
    expect(warnings).toContain('Restored missing area: TemplateArea');
  });

  it('rejects truly invalid area/category values (non-string, too long, empty)', () => {
    const emptyCatBoard = emptyState();
    emptyCatBoard.tasks = [createTask({ title: 'Empty' })];
    emptyCatBoard.tasks[0].category = '' as never;
    expect(() => validateImported(emptyCatBoard)).toThrow('Backup contains invalid tasks.');

    const tooLongCatBoard = emptyState();
    tooLongCatBoard.tasks = [createTask({ title: 'Too long' })];
    tooLongCatBoard.tasks[0].category = 'a'.repeat(41) as never;
    expect(() => validateImported(tooLongCatBoard)).toThrow('Backup contains invalid tasks.');

    const nonStringCatBoard = emptyState();
    nonStringCatBoard.tasks = [createTask({ title: 'Non-string' })];
    (nonStringCatBoard.tasks[0] as unknown as Record<string, unknown>).category = 12345;
    expect(() => validateImported(nonStringCatBoard)).toThrow('Backup contains invalid tasks.');

    const emptyCompBoard = emptyState();
    emptyCompBoard.completions = [{ id: 'c', taskId: 't', title: 'Done', category: '', completedAt: '2026-10-16T01:00:00Z', periodKey: 'once' }];
    expect(() => validateImported(emptyCompBoard)).toThrow('Backup contains invalid completion history.');

    const tooLongCompBoard = emptyState();
    tooLongCompBoard.completions = [{ id: 'c', taskId: 't', title: 'Done', category: 'x'.repeat(41), completedAt: '2026-10-16T01:00:00Z', periodKey: 'once' }];
    expect(() => validateImported(tooLongCompBoard)).toThrow('Backup contains invalid completion history.');
  });
});

