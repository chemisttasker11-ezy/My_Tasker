import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Check, Clock3, Copy, Flag, X } from 'lucide-react';
import {
  type BoardState,
  type PlannedEntry
} from '../../model';
import { formatDate } from '../../lib/display';
import { visibleStatus } from '../../lib/progress';
import { calendarOccurrences } from '../../lib/calendar';
import {
  copyToDays,
  entriesForDate,
  moveEntry,
  planTask,
  refreshFromSource,
  removeEntry,
  reorderDay,
  setEntryStatus,
  toggleEntryItem,
  updateEntry
} from '../../lib/planning';
import { DayPlan } from './DayPlan';
import { BoardPicker } from './BoardPicker';

export interface DayPlanModalProps {
  date: string;
  board: BoardState;
  setBoard: Dispatch<SetStateAction<BoardState>>;
  onDismiss: () => void;
  returnFocusTo?: HTMLElement | null;
}

export function DayPlanModal({
  date,
  board,
  setBoard,
  onDismiss,
  returnFocusTo
}: DayPlanModalProps) {
  const scrimRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const lastFocusedEntryRef = useRef<HTMLElement | null>(null);

  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const returnFocusToRef = useRef(returnFocusTo);
  useEffect(() => {
    returnFocusToRef.current = returnFocusTo;
  }, [returnFocusTo]);

  // Drag tracking for Esc cancellation
  const isDraggingRef = useRef(false);
  const justCancelledDragRef = useRef(false);

  // Edit sub-view state
  const [editingEntry, setEditingEntry] = useState<PlannedEntry | null>(null);
  const editingEntryRef = useRef<PlannedEntry | null>(null);
  editingEntryRef.current = editingEntry;

  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editDate, setEditDate] = useState('');
  const [copyDate, setCopyDate] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const handleOpenEdit = useCallback((entry: PlannedEntry) => {
    lastFocusedEntryRef.current = document.activeElement as HTMLElement;
    setEditingEntry(entry);
    setEditTitle(entry.title);
    setEditNotes(entry.notes ?? '');
    setEditTime(entry.startTime ?? '');
    setEditDuration(entry.durationMin ? String(entry.durationMin) : '');
    setEditDate(entry.date);
    setCopyDate(entry.date);
    setCopyMessage('');
  }, []);

  const restoreFocusToEntry = useCallback((entryId?: string) => {
    requestAnimationFrame(() => {
      if (lastFocusedEntryRef.current && document.contains(lastFocusedEntryRef.current)) {
        lastFocusedEntryRef.current.focus();
      } else if (entryId && modalRef.current) {
        const entryCard = modalRef.current.querySelector<HTMLElement>(`[data-testid="planned-entry-${entryId}"]`);
        const target = entryCard?.querySelector<HTMLElement>('button[aria-label^="Open details"], button') ?? entryCard;
        target?.focus();
      }
    });
  }, []);

  const handleCancelEdit = useCallback(() => {
    const entryId = editingEntryRef.current?.id;
    setEditingEntry(null);
    restoreFocusToEntry(entryId);
  }, [restoreFocusToEntry]);

  const handleSaveEdit = useCallback(() => {
    const entry = editingEntryRef.current;
    if (!entry) return;
    const entryId = entry.id;
    setBoard(b =>
      updateEntry(b, entryId, {
        title: editTitle.trim() || entry.title,
        notes: editNotes.trim() || undefined,
        startTime: editTime || undefined,
        durationMin: editDuration ? Math.max(0, Number(editDuration)) : undefined,
        date: editDate || entry.date
      })
    );
    setEditingEntry(null);
    restoreFocusToEntry(entryId);
  }, [editTitle, editNotes, editTime, editDuration, editDate, setBoard, restoreFocusToEntry]);

  const handleCopyToDate = useCallback(() => {
    const entry = editingEntryRef.current;
    if (!entry || !copyDate) return;
    setBoard(b => copyToDays(b, entry.sourceTaskId, [copyDate]));
    setCopyMessage(`Copied to ${formatDate(copyDate)}`);
  }, [copyDate, setBoard]);

  // Focus first field in editor view when opened
  useEffect(() => {
    if (editingEntry) {
      requestAnimationFrame(() => {
        firstFieldRef.current?.focus();
      });
    }
  }, [editingEntry !== null]);

  // Modal mount/unmount effect: inert outside and initial focus on close button
  useEffect(() => {
    closeBtnRef.current?.focus();

    const inertedElements: HTMLElement[] = [];
    const scrim = scrimRef.current;
    if (scrim) {
      let current: HTMLElement | null = scrim;
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
    }

    return () => {
      for (const el of inertedElements) {
        el.removeAttribute('inert');
        (el as unknown as { inert?: boolean }).inert = false;
      }
      returnFocusToRef.current?.focus?.();
    };
  }, []);

  // Keyboard navigation: Escape and Tab handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingEntryRef.current) {
          e.preventDefault();
          handleCancelEdit();
          return;
        }

        if (isDraggingRef.current || justCancelledDragRef.current) {
          // Drag cancellation is handled by dnd-kit; keep planning modal open
          return;
        }

        e.preventDefault();
        onDismissRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const container = editingEntryRef.current ? editorRef.current : modalRef.current;
        if (!container) return;

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

        if (focusable.length === 0) return;
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
    };
  }, [handleCancelEdit]);

  // Tasks due on this day (read-only)
  const dueOccurrences = useMemo(() => {
    const activeTasks = board.tasks.filter(t => !t.archivedAt);
    return calendarOccurrences(activeTasks, board.completions, date, date);
  }, [board.tasks, board.completions, date]);

  // Planned entries for this date
  const dayEntries = useMemo(() => entriesForDate(board, date), [board, date]);

  // Dnd-kit sensors for shared drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = () => {
    isDraggingRef.current = true;
    justCancelledDragRef.current = false;
  };

  const handleDragCancel = () => {
    isDraggingRef.current = false;
    justCancelledDragRef.current = true;
    requestAnimationFrame(() => {
      justCancelledDragRef.current = false;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    isDraggingRef.current = false;
    justCancelledDragRef.current = false;

    const { active, over } = event;
    if (!active || !over) return;

    // Dragging from BoardPicker onto DayPlan
    if (active.data.current?.type === 'picker-task') {
      const taskId = active.data.current.taskId as string;
      if (
        over.id === `day-plan-${date}` ||
        over.data.current?.type === 'day-plan' ||
        over.data.current?.type === 'planned-entry'
      ) {
        setBoard(b => planTask(b, taskId, date));
      }
      return;
    }

    // Reordering within DayPlan
    if (active.data.current?.type === 'planned-entry') {
      if (active.id !== over.id) {
        const fromIndex = dayEntries.findIndex(e => e.id === active.id);
        const toIndex = dayEntries.findIndex(e => e.id === over.id);
        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
          setBoard(b => reorderDay(b, date, fromIndex, toIndex));
        }
      }
    }
  };

  return (
    <div
      ref={scrimRef}
      className="modal-scrim day-plan-modal-scrim"
      onMouseDown={e => {
        if (e.target === e.currentTarget) {
          if (editingEntry) {
            handleCancelEdit();
          } else {
            onDismiss();
          }
        }
      }}
    >
      <style>{`
        .day-plan-modal {
          width: min(1080px, 96vw);
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          background: var(--paper);
          border-radius: var(--radius-lg, 16px);
          border: 1px solid var(--border);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
          overflow: hidden;
          position: relative;
        }
        .day-plan-modal-body {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          padding: 16px 20px;
          overflow-y: auto;
          flex: 1;
        }
        @media (min-width: 860px) {
          .day-plan-modal-body {
            grid-template-columns: 1fr 360px;
            align-items: start;
            gap: 20px;
          }
        }
        .day-plan-main-col {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
        }
        .day-plan-due-section {
          background: var(--lane-bg, #f4f5f8);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 14px;
        }
        .day-plan-due-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .day-plan-due-header h3 {
          margin: 0;
          font-size: 13px;
          font-weight: 800;
          color: var(--ink);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .day-plan-due-count {
          font-size: 11px;
          font-weight: 800;
          color: var(--muted);
          background: var(--paper);
          padding: 2px 7px;
          border-radius: 999px;
        }
        .day-plan-due-empty {
          margin: 0;
          font-size: 13px;
          color: var(--muted);
          font-style: italic;
        }
        .day-plan-due-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .day-plan-due-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 13px;
          color: var(--ink);
        }
        .day-plan-due-title {
          flex: 1;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .day-plan-due-time {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 11px;
          color: var(--muted);
        }
        .day-plan-edit-view {
          display: flex;
          flex-direction: column;
          max-width: 560px;
          width: 100%;
          margin: 0 auto;
          overflow: hidden;
          flex: 1;
        }
        .day-plan-edit-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px 12px;
          border-bottom: 1px solid var(--border);
        }
        .day-plan-edit-head h2 {
          margin: 0;
          font-size: 18px;
          color: var(--ink);
        }
        .day-plan-edit-scroll {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          overflow-y: auto;
          flex: 1;
        }
        .day-plan-copy-section {
          padding-top: 10px;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .day-plan-copy-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }
        .day-plan-copy-row .field {
          flex: 1;
        }
      `}</style>
      <section
        ref={modalRef}
        className="day-plan-modal task-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Day planning: ${formatDate(date)}`}
      >
        {editingEntry ? (
          <div
            ref={editorRef}
            className="day-plan-edit-view"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${editingEntry.title}`}
          >
            <div className="modal-head day-plan-edit-head">
              <div>
                <span className="eyebrow">EDIT PLANNED ENTRY</span>
                <h2>Edit planned entry</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close entry details"
                onClick={handleCancelEdit}
              >
                <X size={20} />
              </button>
            </div>

            <div className="day-plan-edit-scroll">
              <label className="field full">
                Title
                <input
                  ref={firstFieldRef}
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="Task title"
                />
              </label>

              <label className="field full">
                Notes
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Notes for this day..."
                />
              </label>

              <div className="field-grid">
                <label className="field">
                  Start time
                  <input
                    type="time"
                    value={editTime}
                    onChange={e => setEditTime(e.target.value)}
                  />
                </label>
                <label className="field">
                  Duration (min)
                  <input
                    type="number"
                    min="0"
                    value={editDuration}
                    onChange={e => setEditDuration(e.target.value)}
                    placeholder="e.g. 30"
                  />
                </label>
                <label className="field">
                  Date
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                  />
                </label>
              </div>

              <div className="day-plan-copy-section">
                <div className="day-plan-copy-row">
                  <label className="field">
                    <span>Copy to another day</span>
                    <input
                      type="date"
                      value={copyDate}
                      onChange={e => setCopyDate(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    disabled={!copyDate}
                    onClick={handleCopyToDate}
                  >
                    <Copy size={14} aria-hidden="true" />
                    <span>Copy to date</span>
                  </button>
                </div>
                {copyMessage && (
                  <p className="form-hint" style={{ color: 'var(--positive, #2e7d32)' }}>
                    {copyMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '12px 20px' }}>
              <button
                type="button"
                className="button button-ghost"
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={handleSaveEdit}
              >
                <Check size={16} />
                <span>Save changes</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="modal-head">
              <div>
                <span className="eyebrow">DAY PLANNING</span>
                <h2 id="day-plan-modal-title" tabIndex={-1}>
                  {formatDate(date)}
                </h2>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                className="icon-button"
                aria-label="Close day planning"
                onClick={onDismiss}
              >
                <X size={20} />
              </button>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd}
            >
              <div className="day-plan-modal-body">
                <div className="day-plan-main-col">
                  {/* Existing dated tasks for that day shown read-only above */}
                  <section className="day-plan-due-section" aria-label="Due this day">
                    <div className="day-plan-due-header">
                      <h3>Due this day</h3>
                      <span className="day-plan-due-count">{dueOccurrences.length}</span>
                    </div>
                    {dueOccurrences.length === 0 ? (
                      <p className="day-plan-due-empty">No tasks due this day.</p>
                    ) : (
                      <ul className="day-plan-due-list" aria-label="Tasks due this day">
                        {dueOccurrences.map(occ => {
                          const st = visibleStatus(occ.task, occ.completed);
                          return (
                            <li key={`${occ.task.id}-${occ.date}`} className="day-plan-due-item">
                              <span
                                className={`calendar-status-dot status-${st}`}
                                aria-hidden="true"
                              />
                              <span className="day-plan-due-title">{occ.task.title}</span>
                              {occ.task.scheduledTime && (
                                <span className="meta day-plan-due-time">
                                  <Clock3 size={12} aria-hidden="true" />
                                  {occ.task.scheduledTime}
                                </span>
                              )}
                              {occ.task.priority === 'high' && (
                                <span className="meta urgency" title="High priority">
                                  <Flag size={11} aria-hidden="true" /> High
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  {/* DayPlan list with sortable cards */}
                  <DayPlan
                    date={date}
                    entries={dayEntries}
                    tasks={board.tasks}
                    onReorder={(d, from, to) => setBoard(b => reorderDay(b, d, from, to))}
                    onMoveEntry={(id, targetDate, index) =>
                      setBoard(b => moveEntry(b, id, targetDate, index))
                    }
                    onRemoveEntry={id => setBoard(b => removeEntry(b, id))}
                    onStatusChange={(id, status, postponedTo) =>
                      setBoard(b => setEntryStatus(b, id, status, postponedTo))
                    }
                    onToggleChecklistItem={(id, itemId) =>
                      setBoard(b => toggleEntryItem(b, id, itemId))
                    }
                    onRefreshFromSource={id => setBoard(b => refreshFromSource(b, id))}
                    onOpenEdit={handleOpenEdit}
                    standalone={false}
                  />
                </div>

                {/* BoardPicker panel */}
                <BoardPicker
                  tasks={board.tasks}
                  areas={board.areas}
                  targetDate={date}
                  targetDayLabel={formatDate(date)}
                  onAddTask={(taskId, targetDate) => setBoard(b => planTask(b, taskId, targetDate))}
                  enableDrag={true}
                />
              </div>
            </DndContext>
          </>
        )}
      </section>
    </div>
  );
}
