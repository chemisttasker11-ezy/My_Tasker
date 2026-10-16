import {
  type BoardState,
  type PlannedEntry,
  type PlannedEntryChecklistItem,
  type TaskStatus,
  generateId,
  validISODate,
  LIMITS
} from '../model';

export interface PlanTaskOptions {
  startTime?: string;
  durationMin?: number;
  notes?: string;
  order?: number;
}

export type UpdatePlannedEntryFields = Partial<
  Omit<PlannedEntry, 'id' | 'sourceTaskId' | 'createdAt'>
>;

/** Returns all planned entries for a given date, sorted by ascending order. */
export function entriesForDate(board: BoardState, date: string): PlannedEntry[] {
  if (!board.plannedEntries || !date || !validISODate(date)) return [];
  return board.plannedEntries
    .filter(e => e.date === date)
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

/**
 * Plans a board task onto a specific date by creating an independent PlannedEntry copy.
 * The source task, its dueDate, recurrence and completions are never modified.
 * Planning the same task multiple times on the same date is permitted.
 */
export function planTask(
  board: BoardState,
  taskId: string,
  date: string,
  opts?: PlanTaskOptions
): BoardState {
  if (!date || !validISODate(date)) return board;
  const task = board.tasks.find(t => t.id === taskId);
  if (!task) return board;

  const currentEntries = board.plannedEntries ?? [];
  if (currentEntries.length >= LIMITS.plannedEntries) return board;

  const dayEntries = currentEntries.filter(e => e.date === date);
  const order = opts?.order !== undefined
    ? opts.order
    : (dayEntries.length > 0 ? Math.max(...dayEntries.map(e => e.order)) + 1 : 0);

  const checklist: PlannedEntryChecklistItem[] = (task.subtasks ?? [])
    .slice(0, LIMITS.checklist)
    .map(s => ({
      id: generateId(),
      title: s.title.slice(0, LIMITS.title),
      done: false
    }));

  const startTime = opts?.startTime !== undefined
    ? (opts.startTime || undefined)
    : (task.scheduledTime ? task.scheduledTime : undefined);

  const durationMin = opts?.durationMin !== undefined
    ? opts.durationMin
    : (task.estimateMinutes > 0 ? task.estimateMinutes : undefined);

  const rawNotes = opts?.notes !== undefined
    ? opts.notes
    : (task.description ? task.description : undefined);
  const notes = rawNotes !== undefined
    ? (rawNotes ? rawNotes.slice(0, LIMITS.notes) : undefined)
    : undefined;

  const title = task.title.slice(0, LIMITS.title);

  const newEntry: PlannedEntry = {
    id: generateId(),
    sourceTaskId: task.id,
    date,
    order,
    startTime,
    durationMin,
    status: 'not-started',
    title,
    checklist,
    notes,
    createdAt: new Date().toISOString()
  };

  return {
    ...board,
    plannedEntries: [...currentEntries, newEntry]
  };
}

/**
 * Copies a task to multiple dates in sequence.
 * Each copy gets independent checklist progress and status.
 */
export function copyToDays(board: BoardState, taskId: string, dates: string[]): BoardState {
  if (!dates || !Array.isArray(dates) || dates.length === 0) return board;
  return dates.reduce((currentBoard, date) => planTask(currentBoard, taskId, date), board);
}

/**
 * Moves an entry to another date (or to a specific index within that date),
 * re-normalizing orders cleanly for both affected dates.
 */
export function moveEntry(
  board: BoardState,
  entryId: string,
  date: string,
  index?: number
): BoardState {
  if (!date || !validISODate(date)) return board;
  const entries = board.plannedEntries ?? [];
  const entry = entries.find(e => e.id === entryId);
  if (!entry) return board;

  const oldDate = entry.date;
  if (oldDate === date && index === undefined) return board;

  const remaining = entries.filter(e => e.id !== entryId);
  const targetDayEntries = remaining
    .filter(e => e.date === date)
    .sort((a, b) => a.order - b.order);

  const movedEntry: PlannedEntry = { ...entry, date };

  if (index !== undefined && index >= 0 && index <= targetDayEntries.length) {
    targetDayEntries.splice(index, 0, movedEntry);
  } else {
    targetDayEntries.push(movedEntry);
  }

  const updatedTargetEntries = targetDayEntries.map((e, idx) => ({ ...e, order: idx }));
  const updatedTargetIds = new Set(updatedTargetEntries.map(e => e.id));

  let oldDayEntries: PlannedEntry[] = [];
  if (oldDate !== date) {
    oldDayEntries = remaining
      .filter(e => e.date === oldDate)
      .sort((a, b) => a.order - b.order)
      .map((e, idx) => ({ ...e, order: idx }));
  }
  const updatedOldIds = new Set(oldDayEntries.map(e => e.id));

  const otherEntries = remaining.filter(
    e => !updatedTargetIds.has(e.id) && !updatedOldIds.has(e.id)
  );

  return {
    ...board,
    plannedEntries: [...otherEntries, ...oldDayEntries, ...updatedTargetEntries]
  };
}

/** Reorders entries within a single day. Returns board unchanged if indices are invalid. */
export function reorderDay(
  board: BoardState,
  date: string,
  fromIndex: number,
  toIndex: number
): BoardState {
  if (!date || !validISODate(date)) return board;
  const dayEntries = entriesForDate(board, date);
  if (
    fromIndex < 0 ||
    fromIndex >= dayEntries.length ||
    toIndex < 0 ||
    toIndex >= dayEntries.length ||
    fromIndex === toIndex
  ) {
    return board;
  }

  const reordered = [...dayEntries];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  const updatedDayEntries = reordered.map((item, idx) => ({ ...item, order: idx }));
  const updatedIds = new Set(updatedDayEntries.map(e => e.id));
  const otherEntries = (board.plannedEntries ?? []).filter(e => !updatedIds.has(e.id));

  return {
    ...board,
    plannedEntries: [...otherEntries, ...updatedDayEntries]
  };
}

/** Removes a planned entry from the day plan without touching the source board task. */
export function removeEntry(board: BoardState, entryId: string): BoardState {
  const entries = board.plannedEntries ?? [];
  const entry = entries.find(e => e.id === entryId);
  if (!entry) return board;

  const date = entry.date;
  const remaining = entries.filter(e => e.id !== entryId);
  const normalizedDay = remaining
    .filter(e => e.date === date)
    .sort((a, b) => a.order - b.order)
    .map((e, idx) => ({ ...e, order: idx }));

  const normalizedIds = new Set(normalizedDay.map(e => e.id));
  const otherEntries = remaining.filter(e => !normalizedIds.has(e.id));

  return {
    ...board,
    plannedEntries: [...otherEntries, ...normalizedDay]
  };
}

/**
 * Sets the status of a planned entry. If postponed to a date, moves the entry to that date.
 * Does not modify completions or the source task.
 */
export function setEntryStatus(
  board: BoardState,
  entryId: string,
  status: TaskStatus,
  postponedTo?: string
): BoardState {
  const entries = board.plannedEntries ?? [];
  const entry = entries.find(e => e.id === entryId);
  if (!entry) return board;

  if (status === 'postponed' && postponedTo && validISODate(postponedTo)) {
    const movedBoard = moveEntry(board, entryId, postponedTo);
    const updatedEntries = (movedBoard.plannedEntries ?? []).map(e =>
      e.id === entryId ? { ...e, status: 'postponed' as TaskStatus } : e
    );
    return {
      ...movedBoard,
      plannedEntries: updatedEntries
    };
  }

  const updatedEntry: PlannedEntry = { ...entry, status };
  return {
    ...board,
    plannedEntries: entries.map(e => (e.id === entryId ? updatedEntry : e))
  };
}

/** Toggles an item in a planned entry checklist. Does not modify the source task subtasks. */
export function toggleEntryItem(
  board: BoardState,
  entryId: string,
  itemId: string
): BoardState {
  const entries = board.plannedEntries ?? [];
  const entry = entries.find(e => e.id === entryId);
  if (!entry) return board;

  const itemIndex = entry.checklist.findIndex(c => c.id === itemId);
  if (itemIndex === -1) return board;

  const updatedChecklist = entry.checklist.map(item =>
    item.id === itemId ? { ...item, done: !item.done } : item
  );

  const updatedEntry: PlannedEntry = { ...entry, checklist: updatedChecklist };
  return {
    ...board,
    plannedEntries: entries.map(e => (e.id === entryId ? updatedEntry : e))
  };
}

/** Updates fields of a planned entry (e.g. title, notes, time, duration). */
export function updateEntry(
  board: BoardState,
  entryId: string,
  fields: UpdatePlannedEntryFields
): BoardState {
  const entries = board.plannedEntries ?? [];
  const entry = entries.find(e => e.id === entryId);
  if (!entry) return board;

  const { id: _id, sourceTaskId: _st, createdAt: _ca, ...allowedFields } = fields as Partial<PlannedEntry>;

  if (allowedFields.date !== undefined && (!allowedFields.date || !validISODate(allowedFields.date))) {
    return board;
  }

  if (allowedFields.title !== undefined) {
    allowedFields.title = allowedFields.title.slice(0, LIMITS.title);
  }

  if (allowedFields.notes !== undefined) {
    allowedFields.notes = allowedFields.notes ? allowedFields.notes.slice(0, LIMITS.notes) : undefined;
  }

  if (allowedFields.date && allowedFields.date !== entry.date) {
    const targetDate = allowedFields.date;
    const movedBoard = moveEntry(board, entryId, targetDate, allowedFields.order);
    const updatedEntries = (movedBoard.plannedEntries ?? []).map(e => {
      if (e.id === entryId) {
        return {
          ...e,
          ...allowedFields,
          date: targetDate
        };
      }
      return e;
    });
    return { ...movedBoard, plannedEntries: updatedEntries };
  }

  const updatedEntry: PlannedEntry = {
    ...entry,
    ...allowedFields
  };

  return {
    ...board,
    plannedEntries: entries.map(e => (e.id === entryId ? updatedEntry : e))
  };
}

/**
 * Explicit update from source task: updates title, duration, and checklist headings
 * from the source task while preserving any ticks already checked by the user.
 */
export function refreshFromSource(board: BoardState, entryId: string): BoardState {
  const entries = board.plannedEntries ?? [];
  const entry = entries.find(e => e.id === entryId);
  if (!entry) return board;

  const task = board.tasks.find(t => t.id === entry.sourceTaskId);
  if (!task) return board;

  const updatedChecklist: PlannedEntryChecklistItem[] = (task.subtasks ?? [])
    .slice(0, LIMITS.checklist)
    .map(sub => {
      const existing = entry.checklist.find(c => c.title === sub.title);
      return {
        id: existing ? existing.id : generateId(),
        title: sub.title.slice(0, LIMITS.title),
        done: existing ? existing.done : false
      };
    });

  const updatedEntry: PlannedEntry = {
    ...entry,
    title: task.title.slice(0, LIMITS.title),
    durationMin: task.estimateMinutes > 0 ? task.estimateMinutes : undefined,
    checklist: updatedChecklist
  };

  return {
    ...board,
    plannedEntries: entries.map(e => (e.id === entryId ? updatedEntry : e))
  };
}
