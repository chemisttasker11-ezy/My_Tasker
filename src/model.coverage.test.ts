import { afterEach, describe, expect, it, vi } from 'vitest';
import { brisbaneToday, CATEGORIES, createTask, generateId, initialState, LIMITS, loadBoard, nextDueDate, preserveRaw, readState, STORAGE_KEY, validISODate, validateImported, writeBoard } from './model';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, clear: () => data.clear(), getItem: key => data.get(key) ?? null,
    key: i => [...data.keys()][i] ?? null, removeItem: key => { data.delete(key); }, setItem: (key, value) => { data.set(key, value); } };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('model validation and persistence coverage', () => {
  it('generates IDs using crypto and its fallback without collisions in one millisecond', () => {
    const randomUUID = vi.fn(() => '12345678-1234-1234-1234-123456789abc');
    vi.stubGlobal('crypto', { randomUUID });
    expect(generateId()).toBe('12345678-1234-1234-1234-123456789abc');
    expect(randomUUID).toHaveBeenCalledOnce();
    vi.stubGlobal('crypto', undefined);
    vi.useFakeTimers(); vi.setSystemTime(new Date('2024-02-29T00:00:00Z'));
    const random = vi.spyOn(Math, 'random'); random.mockReturnValueOnce(0.25).mockReturnValueOnce(0.75);
    const ids = [generateId(), generateId()];
    expect(ids[0]).toMatch(/^task-1709164800000-/); expect(ids[0]).not.toBe(ids[1]);
  });
  it.each([
    ['', true], ['2024-02-29', true], ['2000-02-29', true], ['1900-02-29', false], ['2023-02-29', false],
    ['2024-04-31', false], ['2024-12-31', true], ['2024-13-01', false], ['2024-01-00', false],
    ['2024-2-01', false], ['2024-01-01T00:00:00Z', false], ['invalid', false], [null, false], [42, false]
  ])('validates date %s', (value, expected) => expect(validISODate(value)).toBe(expected));
  it('crosses leap-day and year boundaries exactly at Brisbane midnight', () => {
    expect(brisbaneToday(new Date('2024-02-28T13:59:59.999Z'))).toBe('2024-02-28');
    expect(brisbaneToday(new Date('2024-02-28T14:00:00.000Z'))).toBe('2024-02-29');
    expect(brisbaneToday(new Date('2024-12-31T14:00:00.000Z'))).toBe('2025-01-01');
  });
  // Bug: nextDueDate also uses Date.UTC's 1900 offset for accepted ISO years below 0100.
  it.fails('advances recurrence in the same century as an accepted early ISO date', () => {
    expect(validISODate('0099-12-31')).toBe(true);
    expect(nextDueDate('0099-12-31', 'monthly', '0099-12-31')).toBe('0100-01-31');
  });
  it('reads absent and valid storage and reports corrupt or unreadable storage', () => {
    const storage = memoryStorage(); vi.stubGlobal('localStorage', storage);
    expect(readState()).toEqual(initialState());
    const board = { ...initialState(), tasks: [createTask({ title: 'Keep me' })] };
    const saved = writeBoard(null, board, storage);
    expect(readState()).toEqual(saved.board);
    storage.setItem(STORAGE_KEY, '{broken');
    expect(() => readState()).toThrow('could not be loaded');
    expect(storage.getItem(STORAGE_KEY)).toBe('{broken');
    expect([...Array(storage.length)].map((_, i) => storage.key(i)).some(k => k?.includes(':recovery-'))).toBe(true);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); } });
    expect(() => readState()).toThrow('could not be read');
  });
  it('keeps distinct recovery copies when timestamps collide', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2024-02-29T00:00:00Z'));
    const storage = memoryStorage();
    const first = preserveRaw('one', 'backup', storage), second = preserveRaw('two', 'backup', storage);
    expect(first).not.toBe(second); expect(storage.getItem(first)).toBe('one'); expect(storage.getItem(second)).toBe('two');
  });
  it('accepts exact task and history limits and trims excess without mutating input', () => {
    const task = createTask({ title: 'x'.repeat(250), estimateMinutes: 100000, dueDate: '2024-02-29' });
    const board = { ...initialState(), tasks: Array.from({ length: LIMITS.tasks }, (_, i) => ({ ...task, id: `t${i}` })),
      completions: Array.from({ length: LIMITS.completions }, (_, i) => ({ id: `c${i}`, taskId: 't0', title: 'History', category: 'Me', completedAt: '2024-02-29T00:00:00Z', periodKey: 'once' })) };
    const warnings: string[] = [];
    expect(validateImported(board, warnings).tasks).toHaveLength(10000); expect(warnings).toEqual([]);
    board.tasks.push({ ...task, id: 'extra' }); board.completions.push({ ...board.completions[0], id: 'extra' });
    const before = JSON.stringify(board);
    const imported = validateImported(board, warnings);
    expect(imported.tasks).toHaveLength(10000); expect(imported.completions).toHaveLength(50000);
    expect(warnings).toHaveLength(2); expect(JSON.stringify(board)).toBe(before);
  });
  it.each([{ title: '' }, { title: 'x'.repeat(251) }, { estimateMinutes: -1 }, { estimateMinutes: 100001 }, { estimateMinutes: 1.5 }, { dueDate: '2023-02-29' }, { scheduledTime: '24:00' }])('rejects malformed task %#', fields => {
    const task = { ...createTask({ title: 'Valid' }), ...fields };
    expect(() => validateImported({ ...initialState(), tasks: [task] })).toThrow('invalid tasks');
  });
});

describe('original v1 backup fixture through the application import validator', () => {
  it('imports all original seed cards and history, persists, exports and reloads without losing original fields', async () => {
    // Explicit pre-migration fixture: no createTask/initialState and no modern optional fields.
    const rows = [
      ['Tax', 'Finance', 'urgent', 'none'], ['Take / book appointments', 'Personal', 'urgent', 'none'],
      ['Clear reports backlog', 'Pharmacy', 'urgent', 'none'], ['Claude setup', 'ChemistTasker', 'urgent', 'none'],
      ['Complete any reports', 'Pharmacy', 'daily', 'daily'], ['Family time', 'Family', 'daily', 'daily'],
      ['Pharmacy shifts or visits', 'Pharmacy', 'daily', 'daily'], ['Check emails and reply', 'Personal', 'daily', 'daily'],
      ['Review my tasks', 'Personal', 'daily', 'daily'], ['Training / CPD', 'Pharmacy', 'daily', 'daily'],
      ['ChemistTasker progress', 'ChemistTasker', 'daily', 'daily'], ['Invoices for shifts', 'Finance', 'weekly', 'weekly'],
      ['Make sure reports are sent', 'Pharmacy', 'weekly', 'weekly'], ['Check new referrals', 'Pharmacy', 'weekly', 'weekly'],
      ['One day outing with family', 'Family', 'weekly', 'weekly'], ['Build a habit with family', 'Family', 'weekly', 'weekly'],
      ['Invoices', 'Finance', 'monthly', 'monthly'], ['Claims', 'Finance', 'monthly', 'monthly'],
      ['Review and pay bills', 'Finance', 'monthly', 'monthly'], ['BAS', 'Finance', 'quarterly', 'quarterly'],
      ['Annual tax return', 'Finance', 'quarterly', 'yearly'], ['Baladi', 'Personal', 'goals', 'none'],
      ['Sport', 'Personal', 'goals', 'none'], ['Grow ChemistTasker', 'ChemistTasker', 'goals', 'none'],
      ['Family habits', 'Family', 'goals', 'none'], ['Lose weight', 'Personal', 'goals', 'none']
    ];
    const fixture = { version: 1, theme: 'dark', tasks: rows.map(([title, category, lane, recurrence], i) => ({
      id: `notebook-${i + 1}`, title, category, lane, recurrence, priority: i === 0 ? 'high' : 'medium',
      description: `Original notes ${i}: preserve ♥`, dueDate: i === 0 ? '2024-02-29' : '', estimateMinutes: i,
      subtasks: [{ id: `step-${i}`, title: `Original step ${i}`, done: i % 2 === 0 }],
      createdAt: '2024-02-01T00:00:00Z', updatedAt: '2024-02-28T14:00:00Z',
      completedAt: i === 0 ? '2024-02-28T14:00:00Z' : '', archivedAt: i === 25 ? '2024-02-29T00:00:00Z' : '', origin: 'notebook'
    })), completions: [
      { id: 'old-once', taskId: 'notebook-1', title: 'Tax', category: 'Finance', completedAt: '2024-02-28T14:00:00Z', periodKey: 'once' },
      { id: 'old-daily', taskId: 'notebook-6', title: 'Family time', category: 'Family', completedAt: '2024-02-28T14:00:00Z', periodKey: '2024-02-29' },
      { id: 'deleted-history', taskId: 'deleted', title: 'Deleted task history', category: 'Personal', completedAt: '2024-02-01T00:00:00Z', periodKey: 'once' }
    ] };
    const raw = JSON.stringify(fixture); const file = new Blob([raw], { type: 'application/json' });
    const warnings: string[] = [];
    // This is the real JSON.parse(file.text()) -> validateImported path used by App.importData.
    const imported = validateImported(JSON.parse(await file.text()), warnings);
    expect(imported.tasks).toHaveLength(26);
    imported.tasks.forEach((task, i) => expect(task).toMatchObject(fixture.tasks[i]));
    expect(imported.completions).toMatchObject(fixture.completions);
    expect(imported.completions).toHaveLength(3); expect(imported.areas).toEqual(CATEGORIES);
    expect(imported.theme).toBe('dark'); expect(imported.plannedEntries).toEqual([]); expect(warnings).toEqual([]);
    const storage = memoryStorage(); const saved = writeBoard(null, imported, storage);
    expect(loadBoard(storage).board).toEqual(saved.board);
    const reimported = validateImported(JSON.parse(JSON.stringify(saved.board, null, 2)));
    expect(reimported).toEqual(saved.board);
    expect(JSON.stringify(fixture)).toBe(raw);
  });
});
