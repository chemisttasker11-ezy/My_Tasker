import {
  useDroppable,
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type PlannedEntry, type Task, type TaskStatus } from '../../model';
import { PlannedEntryCard } from './PlannedEntryCard';

export interface DayPlanProps {
  date: string;
  entries: PlannedEntry[];
  tasks?: Task[];
  onReorder?: (date: string, fromIndex: number, toIndex: number) => void;
  onMoveEntry?: (entryId: string, targetDate: string, index?: number) => void;
  onRemoveEntry?: (entryId: string) => void;
  onStatusChange?: (entryId: string, status: TaskStatus, postponedTo?: string) => void;
  onToggleChecklistItem?: (entryId: string, itemId: string) => void;
  onOpenEdit?: (entry: PlannedEntry) => void;
  onRefreshFromSource?: (entryId: string) => void;
  emptyMessage?: string;
  standalone?: boolean;
  className?: string;
  dayTitle?: string;
}

interface SortablePlannedEntryItemProps {
  entry: PlannedEntry;
  index: number;
  totalEntries: number;
  sourceTask?: Task;
  onStatusChange?: (entryId: string, status: TaskStatus, postponedTo?: string) => void;
  onToggleChecklistItem?: (entryId: string, itemId: string) => void;
  onOpenEdit?: (entry: PlannedEntry) => void;
  onRemove?: (entryId: string) => void;
  onMoveToDay?: (entryId: string, targetDate: string) => void;
  onMoveUp?: (entryId: string) => void;
  onMoveDown?: (entryId: string) => void;
  onRefreshFromSource?: (entryId: string) => void;
}

function SortablePlannedEntryItem({
  entry,
  index,
  totalEntries,
  sourceTask,
  onStatusChange,
  onToggleChecklistItem,
  onOpenEdit,
  onRemove,
  onMoveToDay,
  onMoveUp,
  onMoveDown,
  onRefreshFromSource
}: SortablePlannedEntryItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    data: { type: 'planned-entry', entry, index }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-card-wrapper ${isDragging ? 'is-dragging' : ''}`}
    >
      <PlannedEntryCard
        entry={entry}
        sourceTask={sourceTask}
        canMoveUp={index > 0}
        canMoveDown={index < totalEntries - 1}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
        onStatusChange={onStatusChange}
        onToggleChecklistItem={onToggleChecklistItem}
        onOpenEdit={onOpenEdit}
        onRemove={onRemove}
        onMoveToDay={onMoveToDay}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onRefreshFromSource={onRefreshFromSource}
      />
    </div>
  );
}

export function sortPlannedEntries(entries: PlannedEntry[]): PlannedEntry[] {
  return [...entries].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

export function DayPlan({
  date,
  entries,
  tasks = [],
  onReorder,
  onMoveEntry,
  onRemoveEntry,
  onStatusChange,
  onToggleChecklistItem,
  onOpenEdit,
  onRefreshFromSource,
  emptyMessage = 'Nothing planned yet. Add from your board.',
  standalone = false,
  className = '',
  dayTitle
}: DayPlanProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-plan-${date}`,
    data: { type: 'day-plan', date }
  });

  const sortedEntries = sortPlannedEntries(entries);
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const fromIndex = sortedEntries.findIndex(e => e.id === active.id);
      const toIndex = sortedEntries.findIndex(e => e.id === over.id);
      if (fromIndex !== -1 && toIndex !== -1 && onReorder) {
        onReorder(date, fromIndex, toIndex);
      }
    }
  };

  const content = (
    <div
      ref={setNodeRef}
      className={`day-plan-container ${isOver ? 'is-over' : ''} ${className}`}
      data-testid={`day-plan-${date}`}
    >
      {dayTitle ? (
        <header className="day-plan-header">
          <h3>{dayTitle}</h3>
          <span className="day-plan-count">{sortedEntries.length}</span>
        </header>
      ) : null}

      {sortedEntries.length === 0 ? (
        <div className="day-plan-empty">
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <SortableContext items={sortedEntries.map(e => e.id)} strategy={verticalListSortingStrategy}>
          <div className="day-plan-list">
            {sortedEntries.map((entry, index) => (
              <SortablePlannedEntryItem
                key={entry.id}
                entry={entry}
                index={index}
                totalEntries={sortedEntries.length}
                sourceTask={taskMap.get(entry.sourceTaskId)}
                onStatusChange={onStatusChange}
                onToggleChecklistItem={onToggleChecklistItem}
                onOpenEdit={onOpenEdit}
                onRemove={onRemoveEntry}
                onMoveToDay={onMoveEntry}
                onMoveUp={() => onReorder?.(date, index, index - 1)}
                onMoveDown={() => onReorder?.(date, index, index + 1)}
                onRefreshFromSource={onRefreshFromSource}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );

  if (standalone) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {content}
      </DndContext>
    );
  }

  return content;
}
