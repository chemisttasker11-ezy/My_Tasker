import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Copy,
  Flag,
  GripVertical,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  TrendingUp,
  X
} from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  defaultAnnouncements,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  type BoardState,
  type Lane,
  type PlannedEntry,
  type Task,
  type TaskStatus,
  type View,
  type WeekReview,
  validISODate
} from '../model';
import { addDays, calendarOccurrences, dateTitle, mondayOf } from '../lib/calendar';
import { formatDate } from '../lib/display';
import { STATUS_LABEL, visibleStatus } from '../lib/progress';
import { PRIORITY_WEIGHTS, scoreWeek, STATUS_POINTS } from '../lib/scoring';
import {
  copyToDays,
  entriesForDate,
  moveEntry,
  planTask,
  refreshFromSource,
  removeEntry,
  restoreEntry,
  reorderDay,
  setEntryStatus,
  toggleEntryItem,
  updateEntry,
  type UpdatePlannedEntryFields
} from '../lib/planning';
import { useModalFocus } from '../components/planning/useModalFocus';
import { BoardPicker } from '../components/planning/BoardPicker';
import { DayPlan } from '../components/planning/DayPlan';
import { WeeklyScoreMeter } from '../components/WeeklyScoreMeter';
import { TaskStatusPicker } from '../components/TaskStatusPicker';

type ReviewNotes = Pick<WeekReview, 'wins' | 'blockers' | 'adjustment'>;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface Props {
  board: BoardState;
  setBoard: Dispatch<SetStateAction<BoardState>>;
  today: string;
  navigate: (view: View) => void;
  onEdit: (task: Task | null, lane?: Lane, defaultDate?: string) => void;
  onInclude: (weekStart: string, id: string, include: boolean) => void;
  onFocus: (date: string, id: string) => void;
  onReview: (weekStart: string, notes: ReviewNotes) => void;
}

interface PlannedEntryModalProps {
  entry: PlannedEntry;
  sourceTask?: Task;
  days: string[];
  today: string;
  onClose: () => void;
  onSave: (fields: UpdatePlannedEntryFields) => void;
  onStatusChange: (status: TaskStatus, postponedTo?: string) => void;
  onToggleItem: (itemId: string) => void;
  onCopyToDays: (dates: string[]) => void;
  onMoveToDay: (targetDate: string) => void;
  onRefreshFromSource: () => void;
  onRemove: () => void;
}

function PlannedEntryModal({
  entry,
  sourceTask,
  days,
  today: _today,
  onClose,
  onSave,
  onStatusChange,
  onToggleItem,
  onCopyToDays,
  onMoveToDay,
  onRefreshFromSource,
  onRemove
}: PlannedEntryModalProps) {
  const [title, setTitle] = useState(entry.title);
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [startTime, setStartTime] = useState(entry.startTime ?? '');
  const [durationMin, setDurationMin] = useState(entry.durationMin ? String(entry.durationMin) : '');
  const [targetMoveDate, setTargetMoveDate] = useState(entry.date);
  const [showCopySection, setShowCopySection] = useState(true);
  const [copyWholeWeek, setCopyWholeWeek] = useState(false);
  const [copyDays, setCopyDays] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    days.forEach(d => {
      initial[d] = false;
    });
    return initial;
  });

  const modalRef = useModalFocus(onClose);
  const refreshDraft = () => {
    if (sourceTask) {
      setTitle(sourceTask.title);
      setDurationMin(sourceTask.estimateMinutes > 0 ? String(sourceTask.estimateMinutes) : '');
    }
    onRefreshFromSource();
  };

  const handleToggleWholeWeek = (checked: boolean) => {
    setCopyWholeWeek(checked);
    const next: Record<string, boolean> = {};
    days.forEach(d => {
      next[d] = checked;
    });
    setCopyDays(next);
  };

  const handleToggleDay = (dayDate: string, checked: boolean) => {
    const next = { ...copyDays, [dayDate]: checked };
    setCopyDays(next);
    const allChecked = days.every(d => next[d]);
    setCopyWholeWeek(allChecked);
  };

  const handleCopySubmit = () => {
    const targetDates = days.filter(d => copyDays[d]);
    if (targetDates.length > 0) {
      onCopyToDays(targetDates);
    }
  };

  const handleSaveFields = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: title.trim() || entry.title,
      notes: notes.trim() || undefined,
      startTime: startTime || undefined,
      durationMin: durationMin ? Number(durationMin) : undefined
    });
  };

  const hasAnyChecked = days.some(d => copyDays[d]);

  return (
    <div className="entry-modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        tabIndex={-1}
        className="entry-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="entry-modal-header">
          <h3 id="entry-modal-title">Planned task details</h3>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close details"
          >
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSaveFields} className="entry-modal-body">
          <div className="entry-modal-field">
            <label htmlFor="entry-title-input">Task title</label>
            <input
              id="entry-title-input"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="entry-modal-row">
            <div className="entry-modal-field">
              <label htmlFor="entry-time-input">Scheduled time</label>
              <input
                id="entry-time-input"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
            </div>
            <div className="entry-modal-field">
              <label htmlFor="entry-duration-input">Duration (minutes)</label>
              <input
                id="entry-duration-input"
                type="number"
                min="0"
                step="5"
                placeholder="e.g. 30"
                value={durationMin}
                onChange={e => setDurationMin(e.target.value)}
              />
            </div>
          </div>

          <div className="entry-modal-field">
            <label htmlFor="entry-notes-input">Notes</label>
            <textarea
              id="entry-notes-input"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes for this planned task..."
            />
          </div>

          <div className="entry-modal-field">
            <label>Status</label>
            <TaskStatusPicker
              title={entry.title}
              value={entry.status}
              dueDate={entry.date}
              onChange={(nextStatus, postponedTo) => onStatusChange(nextStatus, postponedTo)}
            />
          </div>

          {entry.checklist && entry.checklist.length > 0 && (
            <div className="entry-modal-field">
              <label>
                Checklist ({entry.checklist.filter(c => c.done).length}/{entry.checklist.length})
              </label>
              <ul className="planned-entry-checklist-items" aria-label={`Checklist for ${entry.title}`}>
                {entry.checklist.map(item => (
                  <li key={item.id} className="planned-entry-checklist-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => onToggleItem(item.id)}
                        aria-label={item.title}
                      />
                      <span className={item.done ? 'item-done' : ''}>{item.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Copy to days section */}
          <div className="entry-modal-copy-section" aria-label="Copy to days">
            <div className="copy-section-header">
              <button
                type="button"
                className="button button-secondary copy-to-days-toggle-btn"
                onClick={() => setShowCopySection(s => !s)}
                aria-expanded={showCopySection}
              >
                <Copy size={15} />
                <span>Copy to days...</span>
              </button>
            </div>

            {showCopySection && (
              <div className="copy-to-days-body">
                <div className="copy-days-checkboxes">
                  <label className="copy-whole-week-label">
                    <input
                      type="checkbox"
                      name="Whole week"
                      aria-label="Whole week"
                      checked={copyWholeWeek}
                      onChange={e => handleToggleWholeWeek(e.target.checked)}
                    />
                    <span><strong>Whole week</strong></span>
                  </label>
                  <div className="copy-days-grid">
                    {days.map((d, index) => (
                      <label key={d} className="copy-day-checkbox">
                        <input
                          type="checkbox"
                          name={DAYS[index]}
                          aria-label={DAYS[index]}
                          checked={Boolean(copyDays[d])}
                          onChange={e => handleToggleDay(d, e.target.checked)}
                        />
                        <span>{DAYS[index]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="copy-actions-row">
                  <button
                    type="button"
                    className="button button-primary button-sm copy-submit-btn"
                    disabled={!hasAnyChecked}
                    onClick={handleCopySubmit}
                  >
                    <Copy size={14} />
                    <span>Copy to days</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Move to day section */}
          <div className="entry-modal-field">
            <label htmlFor="entry-move-date-input">Move to another day</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                id="entry-move-date-input"
                type="date"
                value={targetMoveDate}
                onChange={e => setTargetMoveDate(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="button button-secondary button-sm"
                disabled={!targetMoveDate || targetMoveDate === entry.date}
                onClick={() => {
                  if (targetMoveDate && targetMoveDate !== entry.date) {
                    onMoveToDay(targetMoveDate);
                  }
                }}
              >
                Move
              </button>
            </div>
          </div>

          <footer className="entry-modal-footer">
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {sourceTask && (
                <button
                  type="button"
                  className="button button-ghost button-sm"
                  onClick={refreshDraft}
                  title="Update title and checklist from board task"
                >
                  <RefreshCw size={14} />
                  <span>Refresh from task</span>
                </button>
              )}
              <button
                type="button"
                className="button button-ghost danger button-sm"
                onClick={onRemove}
              >
                <Trash2 size={14} />
                <span>Remove from plan</span>
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="button button-secondary button-sm"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary button-sm"
              >
                Save changes
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

/** Visual planning composes the shared calendar projector, pure score model, and planning workflow. */
export function WeekPlannerView({
  board,
  setBoard,
  today,
  navigate,
  onEdit,
  onInclude,
  onFocus,
  onReview
}: Props) {
  const [anchor, setAnchor] = useState(today);
  const weekStart = mondayOf(anchor);
  const weekEnd = addDays(weekStart, 6);
  const isPastWeek = weekEnd < today;
  const plan = board.weekPlans?.[weekStart];
  const summary = useMemo(() => scoreWeek(plan, board, weekStart, today), [plan, board, weekStart, today]);
  const shownPercent = isPastWeek && plan?.review?.savedAt ? plan.review.scoreSnapshot : summary.percent;

  const [notes, setNotes] = useState<ReviewNotes>({ wins: '', blockers: '', adjustment: '' });
  useEffect(() => {
    setNotes({
      wins: board.weekPlans?.[weekStart]?.review?.wins ?? '',
      blockers: board.weekPlans?.[weekStart]?.review?.blockers ?? '',
      adjustment: board.weekPlans?.[weekStart]?.review?.adjustment ?? ''
    });
  // Deliberately reset the draft only when changing weeks, not on every status update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const scheduled = useMemo(
    () => calendarOccurrences(board.tasks, board.completions, weekStart, weekEnd),
    [board.tasks, board.completions, weekStart, weekEnd]
  );
  const byDay = useMemo(() => {
    const grouped = new Map<string, typeof scheduled>();
    for (const item of scheduled) grouped.set(item.date, [...(grouped.get(item.date) ?? []), item]);
    return grouped;
  }, [scheduled]);

  const plannedIds = new Set(plan?.commitments.map(item => item.taskId) ?? []);
  const candidates = [...new Map(scheduled.filter(item => !plannedIds.has(item.task.id)).map(item => [item.task.id, item.task])).values()];
  const backlog = board.tasks.filter(
    task => !task.archivedAt && !task.dueDate && !task.completedAt && !plannedIds.has(task.id) && task.lane !== 'goals'
  ).slice(0, 8);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  // Responsive state: >=1024px desktop vs <1024px mobile
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
    };
    mql.addEventListener('change', onChange);
    setIsDesktop(mql.matches);

    const onResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', onResize);

    return () => {
      mql.removeEventListener('change', onChange);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Selected day for mobile tab view (<1024px)
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    return days.includes(today) ? today : days[0];
  });

  useEffect(() => {
    if (!days.includes(selectedDay)) {
      setSelectedDay(days.includes(today) ? today : days[0]);
    }
  }, [days, selectedDay, today]);

  // Picker target date for "Add" button selector
  const [pickerTargetDate, setPickerTargetDate] = useState<string>(() => {
    return days.includes(today) ? today : days[0];
  });

  useEffect(() => {
    if (!days.includes(pickerTargetDate)) {
      setPickerTargetDate(days.includes(today) ? today : days[0]);
    }
  }, [days, pickerTargetDate, today]);

  // Mobile bottom sheet open/close
  const [pickerExpanded, setPickerExpanded] = useState(false);
  const removeEditingEntry = useRef<(() => void) | undefined>(undefined);
  const [isPickerSheetOpen, setIsPickerSheetOpen] = useState(false);

  // Active editing/copying modal
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const editingEntry = useMemo(
    () => (board.plannedEntries ?? []).find(e => e.id === editingEntryId) ?? null,
    [board.plannedEntries, editingEntryId]
  );

  // DnD state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Sensor events can arrive before React commits the previous collision. Keep
  // keyboard intent independent of `over`, including when Space immediately drops.
  const keyboardTargetDate = useRef<string | null>(null);

  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    if (args.context.active?.data.current?.type !== 'picker-task') return sortableKeyboardCoordinates(event, args);
    const direction = ['ArrowLeft', 'ArrowUp'].includes(event.code) ? -1 : ['ArrowRight', 'ArrowDown'].includes(event.code) ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const currentDate = keyboardTargetDate.current ?? args.context.over?.data.current?.date ?? args.context.over?.data.current?.entry?.date;
    const current = days.indexOf(currentDate);
    const index = current < 0 ? (direction < 0 ? days.length - 1 : 0) : Math.max(0, Math.min(days.length - 1, current + direction));
    const rect = args.context.droppableRects.get(`day-plan-${days[index]}`);
    if (rect && args.context.collisionRect) {
      keyboardTargetDate.current = days[index];
      return {
        x: rect.left + rect.width / 2 - args.context.collisionRect.width / 2,
        y: rect.top + rect.height / 2 - args.context.collisionRect.height / 2
      };
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates })
  );

  const collisionDetection: CollisionDetection = args => {
    if (args.active.data.current?.type === 'picker-task' && keyboardTargetDate.current) {
      const target = args.droppableContainers.find(container => container.id === `day-plan-${keyboardTargetDate.current}`);
      if (target) return [{ id: target.id }];
    }
    const pointers = pointerWithin(args);
    if (pointers.length) {
      const entryTargets = pointers.filter(
        c => !days.some(d => c.id === `day:${d}` || c.id === `day-plan-${d}`)
      );
      return entryTargets.length ? entryTargets : pointers;
    }
    return closestCorners(args);
  };

  const announcements: Announcements = {
    ...defaultAnnouncements,
    onDragEnd: event => {
      const date = keyboardTargetDate.current;
      return date
        ? `${event.active.data.current?.task?.title ?? 'Task'} added to ${DAYS[days.indexOf(date)]} (${formatDate(date)}).`
        : defaultAnnouncements.onDragEnd(event);
    }
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    keyboardTargetDate.current = null;
    setDraggingId(String(active.id));
  };

  const handleDragCancel = () => {
    keyboardTargetDate.current = null;
    setDraggingId(null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggingId(null);
    // Retain the final intent for the end announcement; the next start/cancel
    // resets it. dnd-kit's `over` can still describe the preceding render here.
    const keyboardDate = keyboardTargetDate.current;
    if (!over && !keyboardDate) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over?.id ?? '');
    const activeData = active.data.current;
    const overData = over?.data.current;

    // Helper to resolve target date from droppable or entry id
    const resolveTargetDate = (): string | null => {
      if (overData?.type === 'day-plan' && overData.date) {
        return overData.date as string;
      }
      if (overIdStr.startsWith('day:')) {
        return overIdStr.slice(4);
      }
      if (overIdStr.startsWith('day-plan-')) {
        return overIdStr.slice(9);
      }
      if (overData?.type === 'planned-entry' && overData.entry?.date) {
        return overData.entry.date as string;
      }
      const overEntry = board.plannedEntries?.find(e => e.id === overIdStr);
      if (overEntry) {
        return overEntry.date;
      }
      return null;
    };

    // Case 1: Dragging a task from the board picker
    const isPickerTask =
      activeData?.type === 'picker-task' ||
      activeIdStr.startsWith('picker:') ||
      activeIdStr.startsWith('picker-task-');

    if (isPickerTask) {
      let taskId = (activeData?.taskId as string) || '';
      if (!taskId) {
        if (activeIdStr.startsWith('picker:')) {
          taskId = activeIdStr.slice(7);
        } else if (activeIdStr.startsWith('picker-task-')) {
          taskId = activeIdStr.slice(12);
        }
      }

      const targetDate = keyboardDate ?? resolveTargetDate();
      if (taskId && targetDate && validISODate(targetDate)) {
        setBoard(b => planTask(b, taskId, targetDate));
      }
      return;
    }

    // Case 2: Dragging a planned entry
    const activeEntry = board.plannedEntries?.find(e => e.id === activeIdStr);
    if (activeEntry) {
      const activeId = activeEntry.id;
      const sourceDate = activeEntry.date;

      // Check if dropped onto another entry for positioning
      const overEntry = board.plannedEntries?.find(e => e.id === overIdStr);

      if (overEntry) {
        const targetDate = overEntry.date;
        if (sourceDate === targetDate) {
          // Reorder within the same day
          if (activeId !== overEntry.id) {
            const dayEntries = entriesForDate(board, sourceDate);
            const fromIndex = dayEntries.findIndex(e => e.id === activeId);
            const toIndex = dayEntries.findIndex(e => e.id === overEntry.id);
            if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
              setBoard(b => reorderDay(b, sourceDate, fromIndex, toIndex));
            }
          }
        } else {
          // Move to a different day at a specific position
          const targetDayEntries = entriesForDate(board, targetDate);
          const toIndex = targetDayEntries.findIndex(e => e.id === overEntry.id);
          setBoard(b => moveEntry(b, activeId, targetDate, toIndex >= 0 ? toIndex : undefined));
        }
        return;
      }

      // Dropped onto a DayPlan container directly
      const targetDate = resolveTargetDate();
      if (targetDate && validISODate(targetDate) && targetDate !== sourceDate) {
        setBoard(b => moveEntry(b, activeId, targetDate));
      }
      return;
    }
  };

  const draggingTask = useMemo(() => {
    if (!draggingId) return null;
    let taskId: string | null = null;
    if (draggingId.startsWith('picker:')) {
      taskId = draggingId.slice(7);
    } else if (draggingId.startsWith('picker-task-')) {
      taskId = draggingId.slice(12);
    }
    return taskId ? board.tasks.find(t => t.id === taskId) ?? null : null;
  }, [board.tasks, draggingId]);

  const draggingEntry = useMemo(() => {
    if (!draggingId) return null;
    return board.plannedEntries?.find(e => e.id === draggingId) ?? null;
  }, [board.plannedEntries, draggingId]);

  // Render individual day column
  const renderDayColumn = (date: string, index: number) => {
    const focusIds = (board.dailyFocus?.[date] ?? []).filter(id => board.tasks.some(t => t.id === id && !t.archivedAt));
    const events = byDay.get(date) ?? [];
    const dayEntries = entriesForDate(board, date);

    return (
      <section
        key={date}
        className={`week-day-column ${date === today ? 'is-today' : ''}`}
        aria-label={`${DAYS[index]}, ${formatDate(date)}`}
        data-testid={`week-day-column-${date}`}
      >
        <div className="week-day-head">
          <span className="week-day-name">{DAYS[index].slice(0, 3)}</span>
          <strong className="week-day-num">{Number(date.slice(-2))}</strong>
          <button
            type="button"
            className="week-day-add-btn"
            aria-label={`Add task on ${formatDate(date)}`}
            title="Add task"
            onClick={() => onEdit(null, 'daily', date)}
          >
            <Plus size={15} />
          </button>
        </div>

        {focusIds.length > 0 && (
          <div className="week-day-focus">
            <Target size={12} />
            <span>{focusIds.length}/3 focused</span>
          </div>
        )}

        <DayPlan
          date={date}
          entries={dayEntries}
          tasks={board.tasks}
          onReorder={(d, from, to) => setBoard(b => reorderDay(b, d, from, to))}
          onMoveEntry={(id, targetDate, idx) => setBoard(b => moveEntry(b, id, targetDate, idx))}
          compact={isDesktop}
          onRestoreEntry={entry => setBoard(b => restoreEntry(b, entry))}
          onRemoveEntry={id => setBoard(b => removeEntry(b, id))}
          onStatusChange={(id, status, postponedTo) => setBoard(b => setEntryStatus(b, id, status, postponedTo))}
          onToggleChecklistItem={(id, itemId) => setBoard(b => toggleEntryItem(b, id, itemId))}
          onEditEntry={(entry, remove) => { removeEditingEntry.current = remove; setEditingEntryId(entry.id); }}
          onRefreshFromSource={id => setBoard(b => refreshFromSource(b, id))}
          standalone={false}
        />

        {events.length > 0 && (
          <div className="week-day-scheduled">
            <span className="week-scheduled-heading">Scheduled</span>
            <div className="week-day-events">
              {events.map(item => {
                const status = visibleStatus(item.task, item.completed);
                const pinned = focusIds.includes(item.task.id);
                return (
                  <article className={`week-task status-${status}`} key={`${item.task.id}-${item.date}`}>
                    <button type="button" className="week-task-title" onClick={() => onEdit(item.task)}>
                      <strong>{item.task.title}</strong>
                      <small>
                        {item.task.scheduledTime ? `${item.task.scheduledTime} · ` : ''}
                        {STATUS_LABEL[status]}
                        {board.weeklyScoreEnabled ? ` / ${STATUS_POINTS[status]} pts` : ''}
                      </small>
                    </button>
                    <div className="week-task-controls">
                      <button
                        type="button"
                        className={`week-focus-toggle ${pinned ? 'is-selected' : ''}`}
                        aria-pressed={pinned}
                        aria-label={`${pinned ? 'Remove' : 'Select'} ${item.task.title} ${pinned ? 'from' : 'for'} top three on ${formatDate(date)}`}
                        disabled={!pinned && focusIds.length >= 3}
                        onClick={() => onFocus(date, item.task.id)}
                      >
                        <Target size={15} />
                      </button>
                      <button
                        type="button"
                        className={`week-commit-toggle ${plannedIds.has(item.task.id) ? 'is-selected' : ''}`}
                        aria-pressed={plannedIds.has(item.task.id)}
                        onClick={() => onInclude(weekStart, item.task.id, !plannedIds.has(item.task.id))}
                      >
                        {plannedIds.has(item.task.id) ? 'Planned' : '+ Plan'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="week-planner">
      <header className="week-page-heading">
        <div>
          <h1>Plan your week</h1>
          <p>Commit to a realistic week, choose three priorities each day and learn from the results.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => navigate('calendar')}>
          <CalendarDays size={18} /> Full calendar <ArrowRight size={16} />
        </button>
      </header>

      <div className="week-navigation panel">
        <div className="week-navigation-controls">
          <button
            className="icon-button"
            type="button"
            onClick={() => setAnchor(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft size={20} />
          </button>
          <button className="button button-secondary" type="button" onClick={() => setAnchor(today)}>
            This week
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setAnchor(addDays(weekStart, 7))}
            aria-label="Next week"
          >
            <ChevronRight size={20} />
          </button>
          <h2>{dateTitle(weekStart, 'week')}</h2>
        </div>
        <span className="week-phase">
          {weekStart === mondayOf(today) ? 'Current week' : isPastWeek ? 'Past week' : 'Coming up'}
        </span>
      </div>

      {/* Planning section: 7 days + BoardPicker wrapped in a shared DndContext */}
      <section className="week-days-section" aria-label="Plan by day">
        <div className="week-section-title">
          <h2>Seven days, one clear plan</h2>
          <p>
            Add tasks from your board to any day, drag to reorder or move between days, and keep your week balanced.
          </p>
        </div>

        <DndContext
          accessibility={{ announcements }}
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          {isDesktop ? (
            <div className={`week-planning-workspace week-planning-desktop`}>
              <div className="week-planning-days-grid" role="region" aria-label="Seven days planning grid">
                {days.map((date, index) => renderDayColumn(date, index))}
              </div>

              <aside className="week-planning-sidebar" aria-label="Board tasks">
                <button type="button" className="button button-secondary desktop-picker-toggle" aria-expanded={pickerExpanded} onClick={() => setPickerExpanded(v => !v)}>{pickerExpanded ? 'Close board tasks' : 'Add from board'}</button>
                <div className="desktop-picker-content" hidden={!pickerExpanded}>
                <div className="picker-target-select-row">
                  <label htmlFor="desktop-picker-target-day">Add to day:</label>
                  <select
                    id="desktop-picker-target-day"
                    aria-label="Target day for added tasks"
                    value={pickerTargetDate}
                    onChange={e => setPickerTargetDate(e.target.value)}
                  >
                    {days.map((d, i) => (
                      <option key={d} value={d}>
                        {DAYS[i]} ({formatDate(d)})
                      </option>
                    ))}
                  </select>
                </div>

                <BoardPicker
                  tasks={board.tasks}
                  areas={board.areas}
                  targetDate={pickerTargetDate}
                  targetDayLabel={DAYS[days.indexOf(pickerTargetDate)] || formatDate(pickerTargetDate)}
                  onAddTask={(taskId, date) => setBoard(b => planTask(b, taskId, date))}
                  onOpenTask={task => { setIsPickerSheetOpen(false); onEdit(task); }}
                  enableDrag={true}
                />
                </div>
              </aside>
            </div>
          ) : (
            <div className="week-planning-workspace week-planning-mobile">
              <div className="week-day-tabs" role="tablist" aria-label="Days of the week">
                {days.map((d, index) => {
                  const isSelected = d === selectedDay;
                  const isTodayDate = d === today;
                  return (
                    <button
                      key={d}
                      role="tab"
                      aria-selected={isSelected}
                      className={`week-day-tab ${isSelected ? 'is-active' : ''} ${isTodayDate ? 'is-today' : ''}`}
                      onClick={() => setSelectedDay(d)}
                    >
                      <span className="tab-day-name">{DAYS[index].slice(0, 3)}</span>
                      <span className="tab-day-num">{Number(d.slice(-2))}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mobile-picker-trigger-row">
                <button
                  type="button"
                  className="button button-primary mobile-open-picker-btn"
                  onClick={() => setIsPickerSheetOpen(true)}
                  aria-label="Add from board"
                >
                  <Plus size={18} />
                  <span>Add from board</span>
                </button>
              </div>

              <div className="week-planning-single-day">
                {renderDayColumn(selectedDay, days.indexOf(selectedDay))}
              </div>

              {isPickerSheetOpen && (
                <div className="board-picker-sheet-backdrop" onClick={() => setIsPickerSheetOpen(false)}>
                  <PickerSheet onClose={() => setIsPickerSheetOpen(false)}>
                    <div className="board-picker-sheet-header">
                      <h3>Add from board</h3>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setIsPickerSheetOpen(false)}
                        aria-label="Close add from board"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <div className="picker-target-select-row">
                      <label htmlFor="mobile-picker-target-day">Add to day:</label>
                      <select
                        id="mobile-picker-target-day"
                        aria-label="Target day for added tasks"
                        value={selectedDay}
                        onChange={e => setSelectedDay(e.target.value)}
                      >
                        {days.map((d, i) => (
                          <option key={d} value={d}>
                            {DAYS[i]} ({formatDate(d)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <BoardPicker
                      tasks={board.tasks}
                      areas={board.areas}
                      targetDate={selectedDay}
                      targetDayLabel={DAYS[days.indexOf(selectedDay)] || formatDate(selectedDay)}
                      onAddTask={(taskId, date) => setBoard(b => planTask(b, taskId, date))}
                      onOpenTask={task => { setIsPickerSheetOpen(false); onEdit(task); }}
                      enableDrag={false}
                    />
                  </PickerSheet>
                </div>
              )}
            </div>
          )}

          <DragOverlay>
            {draggingTask ? (
              <div className="planner-drag-preview">
                <GripVertical size={14} />
                <span>{draggingTask.title}</span>
              </div>
            ) : draggingEntry ? (
              <div className="planner-drag-preview">
                <GripVertical size={14} />
                <span>{draggingEntry.title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </section>

      {/* Score card moved below the days (DC-5, only when board.weeklyScoreEnabled) */}
      {board.weeklyScoreEnabled && (
        <section className="week-overview panel" aria-label="Weekly progress and scoring">
          <div className="week-score-main">
            <span className="week-overline">Your weekly progress</span>
            <WeeklyScoreMeter percent={shownPercent} label="Weighted week score" />
            <p>
              {summary.planned
                ? 'Based on work you committed to, not work moved elsewhere. High-priority work carries more weight.'
                : 'Select the work you actually intend to complete. A score appears once you commit to tasks.'}
            </p>
          </div>
          <div className="week-numbers">
            <div>
              <ClipboardList size={20} />
              <strong>{summary.planned}</strong>
              <span>Committed</span>
            </div>
            <div>
              <CheckCircle2 size={20} />
              <strong>{summary.finished}</strong>
              <span>Finished</span>
            </div>
            <div>
              <Target size={20} />
              <strong>{summary.postponed}</strong>
              <span>Postponed</span>
            </div>
          </div>
        </section>
      )}

      {/* Weekly commitments & review */}
      <div className="week-bottom-grid">
        <section className="panel week-commitments" aria-label="Committed tasks">
          <header className="week-panel-head">
            <div>
              <h2>My commitments</h2>
              <p>
                {summary.planned} selected
                {board.weeklyScoreEnabled ? " / Postponed work still counts in this week's score." : ''}
              </p>
            </div>
            <Flag size={19} />
          </header>

          {summary.items.length ? (
            <div className="week-commit-list">
              {summary.items.map(item => (
                <div className="week-commit-row" key={item.commitment.taskId}>
                  <span className={`week-status-mark status-${item.status}`} aria-hidden="true">
                    <Circle size={12} />
                  </span>
                  <div className="week-commit-details">
                    <strong>{item.commitment.title}</strong>
                    <span>
                      {STATUS_LABEL[item.status]}
                      {board.weeklyScoreEnabled
                        ? ` / ${item.points} pts / ${PRIORITY_WEIGHTS[item.commitment.priority]} weight`
                        : ''}
                      {item.commitment.plannedDate ? ` · Planned ${formatDate(item.commitment.plannedDate)}` : ''}
                    </span>
                    {item.task && item.commitment.plannedDate && item.task.dueDate !== item.commitment.plannedDate && (
                      <small>
                        Now scheduled {item.task.dueDate ? formatDate(item.task.dueDate) : 'without a date'} — still in this plan.
                      </small>
                    )}
                  </div>
                  {board.weeklyScoreEnabled && (
                    <strong className="week-earned-points">
                      {item.earned}/{item.possible}
                    </strong>
                  )}
                  <button
                    type="button"
                    className="week-remove"
                    onClick={() => onInclude(weekStart, item.commitment.taskId, false)}
                    aria-label={`Remove ${item.commitment.title} from weekly plan`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="week-empty-commit">
              <ClipboardList size={26} />
              <h3>Your plan starts here</h3>
              <p>Scheduled tasks appear below. Add only what you realistically expect to finish.</p>
            </div>
          )}

          <div className="week-pick-list">
            <h3>Available this week</h3>
            {candidates.slice(0, 12).map(task => (
              <div className="week-pick-row" key={task.id}>
                <span>{task.title}</span>
                <button type="button" onClick={() => onInclude(weekStart, task.id, true)}>
                  Add to plan
                </button>
              </div>
            ))}
            {!candidates.length && (
              <p className="week-muted">No unplanned scheduled tasks. Use Calendar to schedule more.</p>
            )}
          </div>

          {backlog.length > 0 && (
            <div className="week-pick-list week-backlog">
              <h3>From your unscheduled board</h3>
              {backlog.map(task => (
                <div className="week-pick-row" key={task.id}>
                  <span>{task.title}</span>
                  <button type="button" onClick={() => onEdit(task, task.lane, weekStart)}>
                    Schedule
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel week-review" aria-label="Weekly review">
          <header className="week-panel-head">
            <div>
              <h2>Close the loop</h2>
              <p>A short review makes your next plan more realistic.</p>
            </div>
            <TrendingUp size={20} />
          </header>
          <form
            onSubmit={event => {
              event.preventDefault();
              if (summary.planned) onReview(weekStart, notes);
            }}
          >
            <label>
              What went well?
              <textarea
                maxLength={1400}
                rows={3}
                value={notes.wins}
                onChange={event => setNotes(s => ({ ...s, wins: event.target.value }))}
                placeholder="A few wins worth repeating…"
              />
            </label>
            <label>
              What got in the way?
              <textarea
                maxLength={1400}
                rows={3}
                value={notes.blockers}
                onChange={event => setNotes(s => ({ ...s, blockers: event.target.value }))}
                placeholder="Limited time, waiting for a reply…"
              />
            </label>
            <label>
              What will you adjust next week?
              <textarea
                maxLength={1400}
                rows={3}
                value={notes.adjustment}
                onChange={event => setNotes(s => ({ ...s, adjustment: event.target.value }))}
                placeholder="One practical change…"
              />
            </label>
            <button className="button button-primary" type="submit" disabled={!summary.planned}>
              Save weekly review
            </button>
            <p className="week-review-footnote">
              {board.weeklyScoreEnabled
                ? plan?.review?.savedAt
                  ? 'Review saved. Past weeks show the saved score.'
                  : 'Saving records the current score for future reference.'
                : 'Your review notes are saved with this week.'}
            </p>
          </form>
        </section>
      </div>

      {board.weeklyScoreEnabled && (
        <details className="week-scoring-guide panel">
          <summary>
            How the score works <ChevronRight size={17} />
          </summary>
          <p>
            Your weekly score is the weighted average of the status scores for tasks you deliberately committed to.
            High priority counts 3×, medium 2× and low 1×. Moving or postponing a task does not remove it
            automatically.
          </p>
          <div className="week-score-legend">
            <span>
              Not started <strong>0</strong>
            </span>
            <span>
              Started <strong>25</strong>
            </span>
            <span>
              Progressing <strong>60</strong>
            </span>
            <span>
              Finished <strong>100</strong>
            </span>
            <span>
              Postponed <strong>0</strong>
            </span>
          </div>
          <p>
            Checklist ticks are deliberately separate from status scoring. Finishing any occurrence of a recurring
            task during the week counts as finished for that weekly commitment.
          </p>
        </details>
      )}

      {/* Planned entry modal for edit & Copy to days */}
      {editingEntry && (
        <PlannedEntryModal
          entry={editingEntry}
          sourceTask={board.tasks.find(t => t.id === editingEntry.sourceTaskId)}
          days={days}
          today={today}
          onClose={() => setEditingEntryId(null)}
          onSave={fields => {
            setBoard(b => updateEntry(b, editingEntry.id, fields));
            setEditingEntryId(null);
          }}
          onStatusChange={(status, postponedTo) => {
            setBoard(b => setEntryStatus(b, editingEntry.id, status, postponedTo));
          }}
          onToggleItem={itemId => {
            setBoard(b => toggleEntryItem(b, editingEntry.id, itemId));
          }}
          onCopyToDays={targetDates => {
            setBoard(b => copyToDays(b, editingEntry.sourceTaskId, targetDates));
            setEditingEntryId(null);
          }}
          onMoveToDay={targetDate => {
            setBoard(b => moveEntry(b, editingEntry.id, targetDate));
            setEditingEntryId(null);
          }}
          onRefreshFromSource={() => {
            setBoard(b => refreshFromSource(b, editingEntry.id));
          }}
          onRemove={() => {
            removeEditingEntry.current?.();
            setEditingEntryId(null);
          }}
        />
      )}
    </div>
  );
}

function PickerSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useModalFocus(onClose);
  return <div ref={ref} tabIndex={-1} className="board-picker-sheet" role="dialog" aria-modal="true" aria-label="Add from board" onClick={event => event.stopPropagation()}>{children}</div>;
}
