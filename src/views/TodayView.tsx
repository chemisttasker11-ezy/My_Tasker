import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Circle,
  Clock3,
  Play,
  Plus,
  Target,
  X
} from 'lucide-react';
import {
  createTask,
  generateId,
  LIMITS,
  type BoardState,
  type Lane,
  type PlannedEntry,
  type PlannedEntryChecklistItem,
  type Task,
  type View
} from '../model';
import { formatDate, LANE_LABEL, longToday } from '../lib/display';
import { addDays } from '../lib/calendar';
import {
  entriesForDate,
  moveEntry,
  planTask,
  refreshFromSource,
  removeEntry,
  reorderDay,
  setEntryStatus,
  toggleEntryItem,
  updateEntry,
  type UpdatePlannedEntryFields
} from '../lib/planning';
import { BoardPicker, DayPlan } from '../components/planning';
import { FocusView } from './FocusView';
import { QuickAdd, type ParsedQuickAdd } from '../components/QuickAdd';
import { EmptyState } from '../components/EmptyState';
import { STATUS_LABEL, visibleStatus } from '../lib/progress';
import { STATUS_POINTS } from '../lib/scoring';
import '../styles/today.css';

interface Props {
  board: BoardState;
  setBoard: Dispatch<SetStateAction<BoardState>>;
  scoreEnabled: boolean;
  todayTasks: Task[];
  doneToday: number;
  day: string;
  allTasks: Task[];
  focusIds: string[];
  completed: (task: Task) => boolean;
  onFocus: (date: string, id: string) => void;
  navigate: (view: View) => void;
  showEditor: (task: Task | null, lane?: Lane) => void;
  toggleTask: (id: string) => void;
}

const TIMELINE_START = 360;  // 06:00
const TIMELINE_END = 1320;   // 22:00
const TIMELINE_SPAN = 960;   // 16 hours
const TIMELINE_HOURS = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];

// Retained carry-over dismissal keyed by day across view remounts (Finding 4)
const dismissedCarryOverDays = new Set<string>();

function parseHHMM(timeStr: string): number {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function getCurrentTimeHHMM(): string {
  const p = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const hRaw = p.find(i => i.type === 'hour')?.value ?? '00';
  const h = hRaw === '24' ? '00' : hRaw;
  const m = p.find(i => i.type === 'minute')?.value ?? '00';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function getNowEntry(entries: PlannedEntry[], nowHHMM: string): PlannedEntry | null {
  const unfinished = entries.filter(e => e.status !== 'finished');
  if (unfinished.length === 0) return null;

  const nowMin = parseHHMM(nowHHMM);

  // 1. Current entry: actively running right now
  const current = unfinished.find(e => {
    if (!e.startTime) return false;
    // Finding 8: Missing durations treated as unknown, do not count as running for 30 minutes
    if (!e.durationMin || e.durationMin <= 0) {
      return e.startTime === nowHHMM;
    }
    // Finding 9: Compare numeric minutes against unwrapped end time so midnight-crossing entries work
    const startMin = parseHHMM(e.startTime);
    const endMin = startMin + e.durationMin;
    return nowMin >= startMin && nowMin < endMin;
  });
  if (current) return current;

  // 2. Earliest upcoming timed entry
  const upcomingTimed = unfinished
    .filter(e => Boolean(e.startTime && parseHHMM(e.startTime) >= nowMin))
    .sort((a, b) => a.startTime!.localeCompare(b.startTime!));
  if (upcomingTimed.length > 0) return upcomingTimed[0];

  // 3. Past unfinished timed entries
  const pastTimed = unfinished
    .filter(e => Boolean(e.startTime))
    .sort((a, b) => a.startTime!.localeCompare(b.startTime!));
  if (pastTimed.length > 0) return pastTimed[0];

  // 4. Untimed entries by order
  const untimed = unfinished
    .filter(e => !e.startTime)
    .sort((a, b) => a.order - b.order);
  if (untimed.length > 0) return untimed[0];

  return unfinished[0];
}

interface FocusContainmentProps {
  children: React.ReactNode;
  onDismiss?: () => void;
  restoreTarget?: HTMLElement | null;
}

function FocusContainment({ children, onDismiss, restoreTarget }: FocusContainmentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(
    restoreTarget ?? (document.activeElement as HTMLElement) ?? null
  );
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Move initial focus inside if not already focused inside
    if (!container.contains(document.activeElement)) {
      const focusable = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }

    // Set siblings inert up the DOM tree
    const inertedElements: HTMLElement[] = [];
    let current: HTMLElement | null = container;
    while (current && current !== document.body) {
      const parent: HTMLElement | null = current.parentElement;
      if (parent) {
        for (const sibling of Array.from(parent.children)) {
          if (sibling !== current && sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
            sibling.setAttribute('inert', '');
            (sibling as unknown as { inert?: boolean }).inert = true;
            inertedElements.push(sibling);
          }
        }
      }
      current = parent;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onDismissRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onDismissRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(
          el =>
            el.getClientRects().length > 0 &&
            !el.closest('[inert]') &&
            el.getAttribute('aria-hidden') !== 'true'
        );

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !container.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !container.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      for (const el of inertedElements) {
        el.removeAttribute('inert');
        (el as unknown as { inert?: boolean }).inert = false;
      }
      const opener = openerRef.current;
      if (opener && document.body.contains(opener)) {
        opener.focus();
      } else {
        const fallback = document.querySelector<HTMLElement>(
          '[data-testid="now-card"] button, main [tabindex], main button'
        );
        fallback?.focus();
      }
    };
  }, []);

  return (
    <div ref={containerRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}

interface PlannedEntryEditorModalProps {
  entry: PlannedEntry;
  sourceTask?: Task;
  onSave: (fields: UpdatePlannedEntryFields) => void;
  onDismiss: () => void;
  onOpenSourceTask?: () => void;
}

function PlannedEntryEditorModal({
  entry,
  sourceTask,
  onSave,
  onDismiss,
  onOpenSourceTask
}: PlannedEntryEditorModalProps) {
  const [title, setTitle] = useState(entry.title);
  const [startTime, setStartTime] = useState(entry.startTime ?? '');
  const [duration, setDuration] = useState(entry.durationMin ? String(entry.durationMin) : '');
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [checklist, setChecklist] = useState<PlannedEntryChecklistItem[]>(entry.checklist ?? []);
  const [newChecklistText, setNewChecklistText] = useState('');
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const addChecklistItem = () => {
    if (!newChecklistText.trim()) return;
    setChecklist(prev => [
      ...prev,
      { id: generateId(), title: newChecklistText.trim(), done: false }
    ]);
    setNewChecklistText('');
  };

  const removeChecklistItem = (id: string) => {
    setChecklist(prev => prev.filter(item => item.id !== id));
  };

  const toggleChecklistItem = (id: string) => {
    setChecklist(prev =>
      prev.map(item => (item.id === id ? { ...item, done: !item.done } : item))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    onSave({
      title: trimmedTitle,
      startTime: startTime.trim() ? startTime.trim() : undefined,
      durationMin: duration.trim() ? Math.max(0, parseInt(duration, 10)) || undefined : undefined,
      notes: notes.trim() ? notes : undefined,
      checklist
    });
  };

  return (
    <FocusContainment onDismiss={onDismiss}>
      <div
        className="modal-scrim"
        onMouseDown={e => {
          if (e.target === e.currentTarget) onDismiss();
        }}
      >
        <section
          className="task-modal planned-entry-editor-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Edit planned entry"
          data-testid="planned-entry-editor"
        >
          <div className="modal-head">
            <div>
              <span className="eyebrow">TODAY'S PLAN</span>
              <h2>Edit planned task</h2>
            </div>
            <button
              aria-label="Close editor"
              type="button"
              className="icon-button"
              onClick={onDismiss}
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-scroll">
              <label className="field full">
                Task title
                <input
                  ref={titleInputRef}
                  maxLength={LIMITS.title}
                  required
                  value={title}
                  placeholder="Task title"
                  onChange={e => setTitle(e.target.value)}
                  data-testid="entry-title-input"
                />
              </label>

              <div className="field-grid">
                <label className="field">
                  Scheduled time (optional)
                  <input
                    type="time"
                    aria-label="Scheduled time (optional)"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    data-testid="entry-time-input"
                  />
                </label>
                <label className="field">
                  Duration in minutes (optional)
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    placeholder="e.g. 30"
                    aria-label="Duration in minutes (optional)"
                    value={duration}
                    onChange={e => setDuration(e.target.value)}
                    data-testid="entry-duration-input"
                  />
                </label>
              </div>

              <label className="field full">
                Notes
                <textarea
                  rows={3}
                  maxLength={LIMITS.notes}
                  value={notes}
                  placeholder="Notes for today..."
                  onChange={e => setNotes(e.target.value)}
                  data-testid="entry-notes-input"
                />
              </label>

              <div className="checklist-editor">
                <h3>Checklist</h3>
                {checklist.map(item => (
                  <div className="checklist-editor-row" key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.done}
                      aria-label={`Mark ${item.title} complete`}
                      onChange={() => toggleChecklistItem(item.id)}
                    />
                    <input
                      type="text"
                      className="checklist-item-title-input"
                      value={item.title}
                      aria-label="Checklist item title"
                      onChange={e => {
                        const val = e.target.value;
                        setChecklist(prev =>
                          prev.map(it => (it.id === item.id ? { ...it, title: val } : it))
                        );
                      }}
                    />
                    <button
                      className="icon-button small"
                      type="button"
                      aria-label={`Remove ${item.title}`}
                      onClick={() => removeChecklistItem(item.id)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <div className="checklist-add">
                  <input
                    value={newChecklistText}
                    maxLength={LIMITS.title}
                    placeholder="Add checklist item..."
                    onChange={e => setNewChecklistText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addChecklistItem();
                      }
                    }}
                    data-testid="entry-new-checklist-input"
                  />
                  <button
                    type="button"
                    aria-label="Add checklist item"
                    onClick={addChecklistItem}
                    data-testid="entry-add-checklist-btn"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div>
                {sourceTask && onOpenSourceTask && (
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={onOpenSourceTask}
                    data-testid="open-board-task-btn"
                  >
                    Open board task
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="button button-ghost" onClick={onDismiss}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-secondary"
                  data-testid="save-entry-btn"
                >
                  <Check size={17} /> Save
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </FocusContainment>
  );
}

export function TodayView({
  board,
  setBoard,
  scoreEnabled,
  todayTasks,
  doneToday,
  day,
  allTasks,
  focusIds,
  completed,
  onFocus,
  navigate,
  showEditor,
  toggleTask
}: Props) {
  // Current time in Brisbane / local
  const [nowHHMM, setNowHHMM] = useState(getCurrentTimeHHMM);
  useEffect(() => {
    const refresh = () => setNowHHMM(getCurrentTimeHHMM());
    const interval = window.setInterval(refresh, 10000);
    return () => window.clearInterval(interval);
  }, []);

  // Planned entries for today
  const todayPlannedEntries = useMemo(() => entriesForDate(board, day), [board, day]);

  // "Now" card candidate entry
  const nowEntry = useMemo(
    () => getNowEntry(todayPlannedEntries, nowHHMM),
    [todayPlannedEntries, nowHHMM]
  );

  // Focus view overlay state
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null);
  const focusEntry = useMemo(
    () => (focusEntryId ? board.plannedEntries?.find(e => e.id === focusEntryId) ?? null : null),
    [board.plannedEntries, focusEntryId]
  );

  // Local planned entry editor modal state (Finding 1)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const editingEntry = useMemo(
    () => (editingEntryId ? board.plannedEntries?.find(e => e.id === editingEntryId) ?? null : null),
    [board.plannedEntries, editingEntryId]
  );

  // Mobile board picker bottom sheet state (< 1024px)
  const [isPickerSheetOpen, setIsPickerSheetOpen] = useState(false);

  // Carry-over from yesterday (Finding 4: keyed by day across view remounts)
  const yesterday = useMemo(() => addDays(day, -1), [day]);
  const unfinishedYesterday = useMemo(() => {
    return entriesForDate(board, yesterday).filter(e => e.status !== 'finished');
  }, [board, yesterday]);
  const [, setCarryOverDismissTick] = useState(0);
  const isCarryOverDismissed = dismissedCarryOverDays.has(day);

  const handleBringToToday = () => {
    setBoard(b => unfinishedYesterday.reduce((acc, entry) => moveEntry(acc, entry.id, day), b));
  };

  const handleBackToBoard = () => {
    setBoard(b => unfinishedYesterday.reduce((acc, entry) => removeEntry(acc, entry.id), b));
  };

  const handleDismissCarryOver = () => {
    dismissedCarryOverDays.add(day);
    setCarryOverDismissTick(t => t + 1);
  };

  // QuickAdd: adds a new board task AND plans it for today
  const handleQuickAdd = (parsed: ParsedQuickAdd) => {
    if (!parsed.title.trim()) return;
    const newTask = createTask({
      title: parsed.title,
      priority: parsed.priority ?? 'medium',
      dueDate: parsed.due ?? day,
      lane: 'urgent',
      category: (board.areas && board.areas[0]?.id) || 'Me'
    });
    setBoard(b => {
      if (b.tasks.length >= LIMITS.tasks) return b;
      const withTask = { ...b, tasks: [...b.tasks, newTask] };
      return planTask(withTask, newTask.id, day);
    });
  };

  // Timeline calculations (Finding 8: missing durations treated as unknown, excluded from total)
  const totalPlannedMin = useMemo(() => {
    return todayPlannedEntries.reduce((sum, e) => {
      if (e.durationMin && e.durationMin > 0) return sum + e.durationMin;
      return sum;
    }, 0);
  }, [todayPlannedEntries]);

  const plannedHours = Math.floor(totalPlannedMin / 60);
  const plannedRemainingMin = totalPlannedMin % 60;

  const nowMinutes = parseHHMM(nowHHMM);
  const leftMinutes = Math.max(0, TIMELINE_END - nowMinutes);
  const leftHours = Math.floor(leftMinutes / 60);
  const leftMins = leftMinutes % 60;
  const leftText = leftHours > 0 && leftMins > 0
    ? `${leftHours} h ${leftMins} min`
    : leftHours > 0
    ? `${leftHours} h`
    : `${leftMins} min`;

  const isNowInTimeline = nowMinutes >= TIMELINE_START && nowMinutes <= TIMELINE_END;
  const nowTimelinePct = ((nowMinutes - TIMELINE_START) / TIMELINE_SPAN) * 100;

  const timedEntries = useMemo(
    () => todayPlannedEntries.filter(e => Boolean(e.startTime)),
    [todayPlannedEntries]
  );

  // Findings 6, 7, 8: Partition into in-range blocks, in-range markers, and out-of-range entries
  const { trackBlocks, trackMarkers, outOfRangeEntries } = useMemo(() => {
    const blocks: {
      entry: PlannedEntry;
      startMin: number;
      endMin: number;
      intStart: number;
      intEnd: number;
      duration: number;
      topPct: number;
      heightPct: number;
      isShort: boolean;
    }[] = [];

    const markers: {
      entry: PlannedEntry;
      startMin: number;
      topPct: number;
    }[] = [];

    const outOfRange: PlannedEntry[] = [];

    for (const entry of timedEntries) {
      const startMin = parseHHMM(entry.startTime!);
      if (entry.durationMin && entry.durationMin > 0) {
        const duration = entry.durationMin;
        const endMin = startMin + duration;
        const intStart = Math.max(TIMELINE_START, startMin);
        const intEnd = Math.min(TIMELINE_END, endMin);
        if (intStart < intEnd) {
          const topPct = ((intStart - TIMELINE_START) / TIMELINE_SPAN) * 100;
          const heightPct = ((intEnd - intStart) / TIMELINE_SPAN) * 100;
          const isShort = duration < 45;
          blocks.push({
            entry,
            startMin,
            endMin,
            intStart,
            intEnd,
            duration,
            topPct,
            heightPct,
            isShort
          });
        } else {
          outOfRange.push(entry);
        }
      } else {
        // Unknown duration: time marker
        if (startMin >= TIMELINE_START && startMin <= TIMELINE_END) {
          const topPct = ((startMin - TIMELINE_START) / TIMELINE_SPAN) * 100;
          markers.push({
            entry,
            startMin,
            topPct
          });
        } else {
          outOfRange.push(entry);
        }
      }
    }

    return { trackBlocks: blocks, trackMarkers: markers, outOfRangeEntries: outOfRange };
  }, [timedEntries]);

  // Finding 5: Assign overlapping entries separate columns so they don't hide each other
  const { placedBlocks, placedMarkers } = useMemo(() => {
    type TrackItem = {
      type: 'block' | 'marker';
      start: number;
      end: number;
      col: number;
      totalCols: number;
      originalIndex: number;
    };

    const items: TrackItem[] = [
      ...trackBlocks.map((b, idx) => ({
        type: 'block' as const,
        start: b.intStart,
        end: b.intEnd,
        col: 0,
        totalCols: 1,
        originalIndex: idx
      })),
      ...trackMarkers.map((m, idx) => ({
        type: 'marker' as const,
        start: m.startMin,
        end: m.startMin + 20,
        col: 0,
        totalCols: 1,
        originalIndex: idx
      }))
    ];

    if (items.length === 0) {
      return { placedBlocks: [], placedMarkers: [] };
    }

    items.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return (b.end - b.start) - (a.end - a.start);
    });

    const clusters: TrackItem[][] = [];
    let currentCluster: TrackItem[] = [];
    let clusterEnd = -1;

    for (const item of items) {
      if (currentCluster.length === 0 || item.start < clusterEnd) {
        currentCluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.end);
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.end;
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    for (const cluster of clusters) {
      for (const item of cluster) {
        const usedCols = new Set<number>();
        for (const other of cluster) {
          if (other === item) continue;
          if (other.col === -1) continue;
          if (item.start < other.end && other.start < item.end) {
            usedCols.add(other.col);
          }
        }
        let c = 0;
        while (usedCols.has(c)) {
          c++;
        }
        item.col = c;
      }

      const numCols = Math.max(...cluster.map(it => it.col)) + 1;
      for (const item of cluster) {
        item.totalCols = numCols;
      }
    }

    const placedBlocks = trackBlocks.map((b, idx) => {
      const match = items.find(it => it.type === 'block' && it.originalIndex === idx)!;
      const col = match.col;
      const total = match.totalCols;
      const leftStyle = total === 1 ? '8px' : `calc(${(col / total) * 100}% + 4px)`;
      const widthStyle = total === 1 ? 'calc(100% - 16px)' : `calc(${(1 / total) * 100}% - 8px)`;
      return {
        entry: b.entry,
        duration: b.duration,
        topPct: b.topPct,
        heightPct: b.heightPct,
        isShort: b.isShort,
        colIndex: col,
        totalCols: total,
        leftStyle,
        widthStyle
      };
    });

    const placedMarkers = trackMarkers.map((m, idx) => {
      const match = items.find(it => it.type === 'marker' && it.originalIndex === idx)!;
      const col = match.col;
      const total = match.totalCols;
      const leftStyle = total === 1 ? '8px' : `calc(${(col / total) * 100}% + 4px)`;
      const widthStyle = total === 1 ? 'calc(100% - 16px)' : `calc(${(1 / total) * 100}% - 8px)`;
      return {
        entry: m.entry,
        topPct: m.topPct,
        colIndex: col,
        totalCols: total,
        leftStyle,
        widthStyle
      };
    });

    return { placedBlocks, placedMarkers };
  }, [trackBlocks, trackMarkers]);

  const anytimeEntries = useMemo(
    () => todayPlannedEntries.filter(e => !e.startTime),
    [todayPlannedEntries]
  );

  // Existing top-3 and rest-of-today logic
  const focusTasks = focusIds
    .map(id => allTasks.find(task => task.id === id && !task.archivedAt))
    .filter((task): task is Task => Boolean(task));
  const rest = todayTasks
    .filter(task => !focusIds.includes(task.id))
    .sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1));
  const overdue = todayTasks.filter(task => task.dueDate && task.dueDate < day);

  function taskRow(task: Task, pinned: boolean) {
    const done = completed(task);
    const status = visibleStatus(task, done);
    return (
      <div className={`today-task-row ${pinned ? 'is-focus' : ''}`} key={task.id}>
        <button
          type="button"
          className={`focus-check ${done ? 'checked' : ''}`}
          aria-label={`${done ? 'Undo completion of' : 'Complete'} ${task.title}`}
          onClick={() => toggleTask(task.id)}
        >
          {done ? <Check size={18} /> : <Circle size={22} />}
        </button>
        <button type="button" className="focus-content" onClick={() => showEditor(task)}>
          <strong>{task.title}</strong>
          <small>
            {task.category} · {LANE_LABEL[task.lane]}
            {task.dueDate ? ` · ${formatDate(task.dueDate)}` : ''} · {STATUS_LABEL[status]}
            {scoreEnabled ? ` (${STATUS_POINTS[status]} pts)` : ''}
          </small>
        </button>
        <button
          type="button"
          aria-pressed={pinned}
          disabled={!pinned && focusTasks.length >= 3}
          className={`today-focus-button ${pinned ? 'selected' : ''}`}
          onClick={() => onFocus(day, task.id)}
          aria-label={`${pinned ? 'Remove' : 'Add'} ${task.title} ${pinned ? 'from' : 'to'} today's top three`}
          title={pinned ? 'Remove from top three' : 'Add to top three'}
        >
          <Target size={17} />
        </button>
        <button
          type="button"
          className="icon-button small today-edit-button"
          aria-label={`Edit ${task.title}`}
          onClick={() => showEditor(task)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Your focus today</h1>
          <p>{longToday(day)} · Make the important work manageable.</p>
        </div>
        <button className="button button-secondary" onClick={() => showEditor(null, 'daily')}>
          <Plus size={18} /> Add task
        </button>
      </div>

      <div className="focus-summary">
        <span className="focus-summary-icon">
          <Activity size={22} />
        </span>
        <div>
          <strong>{todayTasks.length} tasks on today's list</strong>
          <p>Pick up to three priorities, then work through the rest at your pace.</p>
        </div>
        {overdue.length > 0 && <span className="overdue-counter">{overdue.length} overdue</span>}
      </div>

      {/* 4. Carry-over card */}
      {unfinishedYesterday.length > 0 && !isCarryOverDismissed && (
        <aside
          className="today-carryover-card"
          role="region"
          aria-label="Carry-over from yesterday"
          data-testid="carry-over-card"
        >
          <div className="today-carryover-content">
            <CalendarDays size={22} className="today-carryover-icon" aria-hidden="true" />
            <p className="today-carryover-text">
              {unfinishedYesterday.length === 1
                ? "1 thing from yesterday isn't done."
                : `${unfinishedYesterday.length} things from yesterday aren't done.`}
            </p>
          </div>
          <div className="today-carryover-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={handleBringToToday}
            >
              Bring to today
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={handleBackToBoard}
            >
              Back to board
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={handleDismissCarryOver}
            >
              Decide later
            </button>
          </div>
        </aside>
      )}

      {/* 1. Top of Today: "Now" card */}
      {nowEntry ? (
        <section className="now-card" aria-label="Current focus" data-testid="now-card">
          <div className="now-card-header">
            <span className="now-badge">NOW</span>
            <div className="now-card-meta">
              {nowEntry.startTime && (
                <span className="now-card-time" title="Scheduled time">
                  <Clock3 size={14} aria-hidden="true" />
                  <span>{nowEntry.startTime}</span>
                </span>
              )}
              {nowEntry.durationMin ? (
                <span className="now-card-duration" title="Estimated duration">
                  <span>{nowEntry.durationMin}m</span>
                </span>
              ) : null}
              {nowEntry.checklist && nowEntry.checklist.length > 0 && (
                <span className="now-card-checklist" title="Checklist progress">
                  <CheckSquare size={14} aria-hidden="true" />
                  <span>
                    {nowEntry.checklist.filter(c => c.done).length}/{nowEntry.checklist.length}
                  </span>
                </span>
              )}
            </div>
          </div>
          <h2 className="now-card-title">{nowEntry.title}</h2>
          {nowEntry.notes && <p className="now-card-notes">{nowEntry.notes}</p>}
          <div className="now-card-actions">
            <button
              type="button"
              className="button button-primary now-card-focus-btn"
              onClick={() => setFocusEntryId(nowEntry.id)}
            >
              <Play size={16} aria-hidden="true" />
              <span>Start focus</span>
            </button>
            <button
              type="button"
              className="button button-secondary now-card-done-btn"
              onClick={() => setBoard(b => setEntryStatus(b, nowEntry.id, 'finished'))}
            >
              <Check size={16} aria-hidden="true" />
              <span>Done</span>
            </button>
          </div>
        </section>
      ) : (
        <section
          className="now-card now-card-empty"
          aria-label="No current focus"
          data-testid="now-card"
        >
          <div className="now-card-header">
            <span className="now-badge">NOW</span>
          </div>
          <p className="now-card-empty-text">Pick something from your board to start.</p>
        </section>
      )}

      {/* FocusView full-screen overlay wrapped with focus containment, background inertness, and focus restoration (Finding 3) */}
      {focusEntry && (
        <FocusContainment onDismiss={() => setFocusEntryId(null)}>
          <FocusView
            title={focusEntry.title}
            notes={focusEntry.notes}
            checklist={focusEntry.checklist.map(c => ({ id: c.id, text: c.title, done: c.done }))}
            estimateMin={focusEntry.durationMin}
            onToggleItem={itemId => setBoard(b => toggleEntryItem(b, focusEntry.id, itemId))}
            onDone={() => {
              setBoard(b => setEntryStatus(b, focusEntry.id, 'finished'));
              setFocusEntryId(null);
            }}
            onExit={() => setFocusEntryId(null)}
          />
        </FocusContainment>
      )}

      {/* Local PlannedEntry editor modal (Finding 1) */}
      {editingEntry && (
        <PlannedEntryEditorModal
          entry={editingEntry}
          sourceTask={board.tasks.find(t => t.id === editingEntry.sourceTaskId)}
          onSave={fields => {
            setBoard(b => updateEntry(b, editingEntry.id, fields));
            setEditingEntryId(null);
          }}
          onDismiss={() => setEditingEntryId(null)}
          onOpenSourceTask={() => {
            const source = board.tasks.find(t => t.id === editingEntry.sourceTaskId);
            setEditingEntryId(null);
            if (source) showEditor(source);
          }}
        />
      )}

      {/* 2. Today's plan + BoardPicker */}
      <section className="today-planning-section" aria-label="Today's planning">
        <div className="today-plan-column">
          <div className="today-plan-header">
            <h2>Today's plan</h2>
            <button
              type="button"
              className="button button-secondary today-mobile-picker-btn"
              onClick={() => setIsPickerSheetOpen(true)}
              aria-label="Add from board"
            >
              <Plus size={16} aria-hidden="true" />
              <span>Add from board</span>
            </button>
          </div>

          <QuickAdd
            onAddParsed={handleQuickAdd}
            onAdd={title => handleQuickAdd({ title })}
            todayISO={day}
            placeholder="Quick add task for today..."
          />

          <DayPlan
            date={day}
            entries={todayPlannedEntries}
            tasks={board.tasks}
            standalone={true}
            onReorder={(date, fromIdx, toIdx) => setBoard(b => reorderDay(b, date, fromIdx, toIdx))}
            onMoveEntry={(entryId, targetDate, idx) =>
              setBoard(b => moveEntry(b, entryId, targetDate, idx))
            }
            onRemoveEntry={entryId => setBoard(b => removeEntry(b, entryId))}
            onStatusChange={(entryId, status, postponedTo) =>
              setBoard(b => setEntryStatus(b, entryId, status, postponedTo))
            }
            onToggleChecklistItem={(entryId, itemId) =>
              setBoard(b => toggleEntryItem(b, entryId, itemId))
            }
            onRefreshFromSource={entryId => setBoard(b => refreshFromSource(b, entryId))}
            onOpenEdit={entry => {
              setEditingEntryId(entry.id);
            }}
          />
        </div>

        <div className="today-desktop-picker">
          <BoardPicker
            tasks={board.tasks}
            areas={board.areas}
            targetDate={day}
            targetDayLabel="today"
            onAddTask={(taskId, targetDate) => setBoard(b => planTask(b, taskId, targetDate))}
            onOpenTask={task => showEditor(task)}
            enableDrag={false}
          />
        </div>
      </section>

      {/* Bottom sheet for mobile BoardPicker (< 1024px) wrapped with focus containment, background inertness, and focus restoration (Finding 2) */}
      {isPickerSheetOpen && (
        <FocusContainment onDismiss={() => setIsPickerSheetOpen(false)}>
          <div
            className="today-bottom-sheet-backdrop"
            onClick={() => setIsPickerSheetOpen(false)}
            role="presentation"
          >
            <div
              className="today-bottom-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Add from board"
              onClick={e => e.stopPropagation()}
            >
              <div className="today-bottom-sheet-header">
                <button
                  type="button"
                  className="icon-button today-bottom-sheet-close"
                  aria-label="Close board picker"
                  onClick={() => setIsPickerSheetOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>
              <BoardPicker
                tasks={board.tasks}
                areas={board.areas}
                targetDate={day}
                targetDayLabel="today"
                onAddTask={(taskId, targetDate) => {
                  setBoard(b => planTask(b, taskId, targetDate));
                }}
                onOpenTask={task => {
                  setIsPickerSheetOpen(false);
                  showEditor(task);
                }}
                enableDrag={false}
              />
            </div>
          </div>
        </FocusContainment>
      )}

      {/* 3. Simple day timeline */}
      <section className="panel today-timeline-panel" aria-label="Today's timeline">
        <div className="panel-heading">
          <div>
            <h2>Day timeline</h2>
            <p className="timeline-summary-text">
              {plannedHours} h {plannedRemainingMin} min planned · {leftText} left today
            </p>
          </div>
        </div>

        <div className="timeline-container">
          <div className="timeline-grid" role="region" aria-label="Schedule 06:00 to 22:00">
            <div className="timeline-hours-column" aria-hidden="true">
              {TIMELINE_HOURS.map(hour => (
                <div key={hour} className="timeline-hour-label">
                  <span>{hour}</span>
                </div>
              ))}
            </div>

            <div className="timeline-track" data-testid="timeline-track">
              {TIMELINE_HOURS.map(hour => (
                <div key={hour} className="timeline-hour-line" />
              ))}

              {isNowInTimeline && (
                <div
                  className="timeline-now-line"
                  style={{ top: `${nowTimelinePct}%` }}
                  title={`Current time: ${nowHHMM}`}
                  aria-label={`Current time: ${nowHHMM}`}
                >
                  <span className="timeline-now-badge">{nowHHMM}</span>
                </div>
              )}

              {placedBlocks.map(block => (
                <div
                  key={block.entry.id}
                  className={`timeline-block ${block.entry.status === 'finished' ? 'is-done' : ''} ${
                    block.isShort ? 'is-short' : ''
                  }`}
                  style={{
                    top: `${block.topPct}%`,
                    height: `${block.heightPct}%`,
                    left: block.leftStyle,
                    width: block.widthStyle
                  }}
                  title={`${block.entry.title} (${block.entry.startTime}, ${block.duration}m)`}
                >
                  {block.isShort ? (
                    <>
                      <span className="timeline-short-bar" aria-hidden="true" />
                      <div className="timeline-block-content timeline-short-content">
                        <strong className="timeline-block-title">{block.entry.title}</strong>
                        <span className="timeline-block-time">
                          {block.entry.startTime} · {block.duration}m
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="timeline-block-content">
                      <strong className="timeline-block-title">{block.entry.title}</strong>
                      <span className="timeline-block-time">
                        {block.entry.startTime} · {block.duration}m
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {placedMarkers.map(marker => (
                <div
                  key={marker.entry.id}
                  className={`timeline-marker ${marker.entry.status === 'finished' ? 'is-done' : ''}`}
                  style={{
                    top: `${marker.topPct}%`,
                    left: marker.leftStyle,
                    width: marker.widthStyle
                  }}
                  title={`${marker.entry.title} (${marker.entry.startTime})`}
                  data-testid={`timeline-marker-${marker.entry.id}`}
                >
                  <span className="timeline-marker-dot" aria-hidden="true" />
                  <div className="timeline-marker-content">
                    <strong className="timeline-block-title">{marker.entry.title}</strong>
                    <span className="timeline-block-time">{marker.entry.startTime}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="timeline-sidebar">
            {outOfRangeEntries.length > 0 && (
              <div className="timeline-out-of-range-section" data-testid="timeline-out-of-range">
                <h3 className="timeline-out-of-range-heading">Early &amp; late</h3>
                <ul className="timeline-out-of-range-list" aria-label="Tasks outside 06:00 to 22:00">
                  {outOfRangeEntries.map(entry => {
                    const done = entry.status === 'finished';
                    return (
                      <li
                        key={entry.id}
                        className={`timeline-out-of-range-row ${done ? 'is-done' : ''}`}
                      >
                        <button
                          type="button"
                          className={`round-check ${done ? 'checked' : ''}`}
                          aria-label={done ? `Undo completion of ${entry.title}` : `Complete ${entry.title}`}
                          onClick={() =>
                            setBoard(b =>
                              setEntryStatus(b, entry.id, done ? 'not-started' : 'finished')
                            )
                          }
                        >
                          {done ? <Check size={14} strokeWidth={3} /> : null}
                        </button>
                        <div className="timeline-anytime-details">
                          <span className="timeline-out-of-range-title">{entry.title}</span>
                          <span className="timeline-out-of-range-time">
                            {entry.startTime}
                            {entry.durationMin ? ` · ${entry.durationMin}m` : ''}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="timeline-anytime-section">
              <h3 className="timeline-anytime-heading">Anytime</h3>
              {anytimeEntries.length > 0 ? (
                <ul className="timeline-anytime-list" aria-label="Tasks without a time">
                  {anytimeEntries.map(entry => {
                    const done = entry.status === 'finished';
                    const checklistCount = entry.checklist?.length ?? 0;
                    const checklistDone = entry.checklist?.filter(c => c.done).length ?? 0;
                    return (
                      <li key={entry.id} className={`timeline-anytime-row ${done ? 'is-done' : ''}`}>
                        <button
                          type="button"
                          className={`round-check ${done ? 'checked' : ''}`}
                          aria-label={done ? `Undo completion of ${entry.title}` : `Complete ${entry.title}`}
                          onClick={() =>
                            setBoard(b =>
                              setEntryStatus(b, entry.id, done ? 'not-started' : 'finished')
                            )
                          }
                        >
                          {done ? <Check size={14} strokeWidth={3} /> : null}
                        </button>
                        <div className="timeline-anytime-details">
                          <span className="timeline-anytime-title">{entry.title}</span>
                          {(entry.durationMin || checklistCount > 0) && (
                            <span className="timeline-anytime-meta">
                              {entry.durationMin ? `${entry.durationMin}m` : null}
                              {entry.durationMin && checklistCount > 0 ? ' · ' : null}
                              {checklistCount > 0 ? `${checklistDone}/${checklistCount}` : null}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="timeline-anytime-empty">No untimed tasks planned.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Existing top-3 focus section (below the plan) */}
      <section className="panel today-top-three">
        <div className="panel-heading">
          <div>
            <h2>My three priorities</h2>
            <p>{focusTasks.length}/3 selected. These remain here even when finished.</p>
          </div>
          <button type="button" className="text-link" onClick={() => navigate('week')}>
            Plan the week <ArrowRight size={16} />
          </button>
        </div>
        {focusTasks.length ? (
          <div className="today-task-list">{focusTasks.map(task => taskRow(task, true))}</div>
        ) : (
          <EmptyState
            icon={Target}
            title="Choose your top three"
            caption="Use the target icon beside any task below to make it a priority."
          />
        )}
      </section>

      {/* Existing rest of today and progress section */}
      <div className="today-layout">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>The rest of today</h2>
              <p>Everything else due or in your daily and urgent lanes.</p>
            </div>
          </div>
          {rest.length ? (
            <div className="today-task-list">{rest.map(task => taskRow(task, false))}</div>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="You're up to date"
              caption="No other unfinished tasks waiting here."
            />
          )}
        </section>

        <section className="panel today-accomplished">
          <div className="panel-heading">
            <div>
              <h2>Today's progress</h2>
            </div>
          </div>
          <div className="done-circle">
            <CheckCircle2 size={32} />
            <strong>{doneToday}</strong>
            <span>done today</span>
          </div>
          <p>Progress comes from following through, not filling every hour.</p>
          <button className="button button-secondary" onClick={() => navigate('completed')}>
            View completed tasks <ArrowRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}
