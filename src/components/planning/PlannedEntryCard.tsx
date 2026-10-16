import { useState, type HTMLAttributes } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  GripVertical,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  X
} from 'lucide-react';
import { type PlannedEntry, type Task, type TaskStatus } from '../../model';
import { categoryInfo } from '../../lib/display';
import { TaskStatusPicker } from '../TaskStatusPicker';

export interface PlannedEntryCardProps {
  entry: PlannedEntry;
  sourceTask?: Task;
  onStatusChange?: (entryId: string, status: TaskStatus, postponedTo?: string) => void;
  onToggleChecklistItem?: (entryId: string, itemId: string) => void;
  onOpenEdit?: (entry: PlannedEntry) => void;
  onRemove?: (entryId: string) => void;
  onMoveToDay?: (entryId: string, targetDate: string) => void;
  onMoveUp?: (entryId: string) => void;
  onMoveDown?: (entryId: string) => void;
  onRefreshFromSource?: (entryId: string) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
  className?: string;
}

export function PlannedEntryCard({
  entry,
  sourceTask,
  onStatusChange,
  onToggleChecklistItem,
  onOpenEdit,
  onRemove,
  onMoveToDay,
  onMoveUp,
  onMoveDown,
  onRefreshFromSource,
  canMoveUp = false,
  canMoveDown = false,
  dragHandleProps,
  isDragging = false,
  className = ''
}: PlannedEntryCardProps) {
  const [showChecklist, setShowChecklist] = useState(false);
  const [showMoveToDay, setShowMoveToDay] = useState(false);
  const [targetDate, setTargetDate] = useState(entry.date);

  const doneCount = entry.checklist?.filter(c => c.done).length ?? 0;
  const totalCount = entry.checklist?.length ?? 0;
  const isDone = entry.status === 'finished';

  const category = sourceTask?.category;
  const catDetails = category ? categoryInfo(category) : null;

  return (
    <article
      className={`task-card planned-entry-card ${isDone ? 'is-done' : ''} ${isDragging ? 'is-dragging' : ''} ${className}`}
      data-testid={`planned-entry-${entry.id}`}
    >
      <header className="task-top">
        {catDetails ? (
          <span className={`category-pill tone-${catDetails.tone}`}>
            <span aria-hidden="true">{catDetails.emoji}</span> {catDetails.id}
          </span>
        ) : (
          <span className="category-pill tone-teal">
            <span aria-hidden="true">●</span> Planned
          </span>
        )}
        <div className="card-actions">
          {sourceTask && onRefreshFromSource && (
            <button
              type="button"
              className="icon-button small subtle"
              onClick={() => onRefreshFromSource(entry.id)}
              aria-label={`Refresh ${entry.title} from board task`}
              title="Refresh title and checklist from board task"
            >
              <RefreshCw size={14} />
            </button>
          )}
          {onOpenEdit && (
            <button
              type="button"
              className="icon-button small subtle"
              onClick={() => onOpenEdit(entry)}
              aria-label={`Open details for ${entry.title}`}
              title="Open details"
            >
              <SlidersHorizontal size={15} />
            </button>
          )}
          {dragHandleProps && (
            <button
              type="button"
              className="drag-handle"
              aria-label={`Drag ${entry.title} to reorder`}
              title="Drag to reorder"
              {...dragHandleProps}
            >
              <GripVertical size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="task-heading">
        <button
          type="button"
          className={`round-check ${isDone ? 'checked' : ''}`}
          aria-label={isDone ? `Undo completion of ${entry.title}` : `Complete ${entry.title}`}
          onClick={() => onStatusChange?.(entry.id, isDone ? 'not-started' : 'finished')}
        >
          {isDone ? <Check size={15} strokeWidth={3} /> : null}
        </button>
        <button
          type="button"
          className="task-title planned-entry-title"
          onClick={() => onOpenEdit?.(entry)}
        >
          {entry.title}
        </button>
      </div>

      {(entry.startTime || entry.durationMin) ? (
        <div className="planned-entry-meta">
          {entry.startTime ? (
            <span className="meta planned-entry-time" title="Scheduled time">
              <Clock3 size={13} aria-hidden="true" />
              <span>{entry.startTime}</span>
            </span>
          ) : null}
          {entry.durationMin ? (
            <span className="meta planned-entry-duration" title="Estimated duration">
              <span>{entry.durationMin}m</span>
            </span>
          ) : null}
        </div>
      ) : null}

      {entry.notes ? (
        <p className="task-description planned-entry-notes">{entry.notes}</p>
      ) : null}

      <TaskStatusPicker
        title={entry.title}
        value={entry.status}
        dueDate={entry.date}
        onChange={(nextStatus, postponedTo) => onStatusChange?.(entry.id, nextStatus, postponedTo)}
        compact
      />

      {totalCount > 0 && (
        <div className="planned-entry-checklist-block">
          <div className="subtasks-snippet planned-entry-checklist-summary">
            <div
              className="mini-progress"
              role="progressbar"
              aria-valuenow={doneCount}
              aria-valuemin={0}
              aria-valuemax={totalCount}
            >
              <span style={{ width: `${(doneCount / totalCount) * 100}%` }} />
            </div>
            <button
              type="button"
              className="planned-entry-checklist-btn"
              onClick={() => setShowChecklist(!showChecklist)}
              aria-expanded={showChecklist}
              aria-label={`${doneCount} of ${totalCount} checklist steps completed. Click to ${showChecklist ? 'hide' : 'show'} steps`}
            >
              <span>{doneCount}/{totalCount}</span>
              <ChevronDown
                size={13}
                className={`chevron-icon ${showChecklist ? 'is-open' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
          {showChecklist && (
            <ul className="planned-entry-checklist-items" aria-label={`Checklist for ${entry.title}`}>
              {entry.checklist.map(item => (
                <li key={item.id} className="planned-entry-checklist-row">
                  <label onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => onToggleChecklistItem?.(entry.id, item.id)}
                      aria-label={item.title}
                    />
                    <span className={item.done ? 'item-done' : ''}>{item.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <footer className="planned-entry-footer">
        <div className="planned-entry-actions">
          <button
            type="button"
            className="icon-button small subtle"
            disabled={!canMoveUp}
            onClick={() => onMoveUp?.(entry.id)}
            aria-label={`Move ${entry.title} up`}
            title="Move up"
          >
            <ArrowUp size={15} />
          </button>
          <button
            type="button"
            className="icon-button small subtle"
            disabled={!canMoveDown}
            onClick={() => onMoveDown?.(entry.id)}
            aria-label={`Move ${entry.title} down`}
            title="Move down"
          >
            <ArrowDown size={15} />
          </button>
          <button
            type="button"
            className="button button-ghost button-sm planned-entry-day-btn"
            onClick={() => setShowMoveToDay(!showMoveToDay)}
            aria-expanded={showMoveToDay}
            aria-label={`Move ${entry.title} to another day`}
          >
            <CalendarDays size={14} />
            <span>Move to day...</span>
          </button>
          <button
            type="button"
            className="button button-ghost danger button-sm planned-entry-remove-btn"
            onClick={() => onRemove?.(entry.id)}
            aria-label={`Remove ${entry.title} from plan`}
            title="Remove from plan"
          >
            <Trash2 size={14} />
            <span>Remove from plan</span>
          </button>
        </div>

        {showMoveToDay && (
          <div
            className="planned-entry-move-popup"
            role="group"
            aria-label={`Move ${entry.title} to another date`}
          >
            <label>
              <span>Target date:</span>
              <input
                type="date"
                aria-label={`Target date for ${entry.title}`}
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
              />
            </label>
            <div className="planned-entry-move-actions">
              <button
                type="button"
                className="button button-primary button-sm"
                disabled={!targetDate || targetDate === entry.date}
                onClick={() => {
                  if (targetDate && targetDate !== entry.date) {
                    onMoveToDay?.(entry.id, targetDate);
                    setShowMoveToDay(false);
                  }
                }}
              >
                Move
              </button>
              <button
                type="button"
                className="button button-ghost button-sm"
                onClick={() => setShowMoveToDay(false)}
                aria-label="Cancel move to day"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </footer>
    </article>
  );
}
