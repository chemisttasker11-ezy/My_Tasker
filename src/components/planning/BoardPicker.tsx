import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  ChevronDown,
  Clock3,
  Flag,
  GripVertical,
  Plus,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { type Area, type Category, type Task } from '../../model';
import { categoryInfo } from '../../lib/display';

export interface BoardPickerProps {
  tasks: Task[];
  areas?: Area[];
  targetDate: string;
  targetDayLabel?: string;
  onAddTask: (taskId: string, targetDate: string) => void;
  onOpenTask?: (task: Task) => void;
  enableDrag?: boolean;
  className?: string;
}

interface BoardPickerRowProps {
  task: Task;
  targetDate: string;
  targetDayLabel?: string;
  onAddTask: (taskId: string, targetDate: string) => void;
  onOpenTask?: (task: Task) => void;
  enableDrag: boolean;
}

function BoardPickerRow({
  task,
  targetDate,
  targetDayLabel,
  onAddTask,
  onOpenTask,
  enableDrag
}: BoardPickerRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `picker-task-${task.id}`,
    data: { type: 'picker-task', taskId: task.id, task },
    disabled: !enableDrag
  });

  const cat = categoryInfo(task.category);
  const dayName = targetDayLabel || targetDate;

  return (
    <li
      ref={setNodeRef}
      className={`board-picker-row ${isDragging ? 'is-dragging' : ''}`}
      data-testid={`picker-row-${task.id}`}
    >
      <div className="board-picker-row-main">
        {enableDrag && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="drag-handle board-picker-drag"
            aria-label={`Drag ${task.title} to day plan`}
            title="Drag to day plan"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
        )}
        <div className="board-picker-task-details">
          <div className="board-picker-task-top">
            <span className={`category-pill tone-${cat.tone}`}>
              <span aria-hidden="true">{cat.emoji}</span> {cat.id}
            </span>
            {task.priority === 'high' && (
              <span className="meta urgency" title="High priority">
                <Flag size={11} aria-hidden="true" /> High
              </span>
            )}
            {task.estimateMinutes > 0 && (
              <span className="meta" title="Estimated time">
                <Clock3 size={11} aria-hidden="true" /> {task.estimateMinutes}m
              </span>
            )}
          </div>
          <button
            type="button"
            className="board-picker-title-btn"
            onClick={() => onOpenTask?.(task)}
            title={task.description ? `${task.title} — ${task.description}` : task.title}
          >
            {task.title}
          </button>
        </div>
      </div>

      <button
        type="button"
        className="button button-primary button-sm board-picker-add-button"
        aria-label={`Add ${task.title} to ${dayName}`}
        onClick={() => onAddTask(task.id, targetDate)}
      >
        <Plus size={16} aria-hidden="true" />
        <span>Add</span>
      </button>
    </li>
  );
}

export function BoardPicker({
  tasks,
  areas = [],
  targetDate,
  targetDayLabel,
  onAddTask,
  onOpenTask,
  enableDrag = true,
  className = ''
}: BoardPickerProps) {
  const [search, setSearch] = useState('');
  const [selectedArea, setSelectedArea] = useState<Category | 'All'>('All');

  // Filter out archived tasks
  const activeTasks = tasks.filter(t => !t.archivedAt);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredTasks = activeTasks.filter(t => {
    if (selectedArea !== 'All' && t.category !== selectedArea) {
      return false;
    }
    if (normalizedSearch) {
      const matchTitle = t.title.toLowerCase().includes(normalizedSearch);
      const matchDesc = t.description?.toLowerCase().includes(normalizedSearch);
      return matchTitle || matchDesc;
    }
    return true;
  });

  return (
    <aside
      className={`board-picker-panel ${className}`}
      aria-label="Board tasks picker"
      data-testid="board-picker"
    >
      <header className="board-picker-header">
        <div className="board-picker-title-row">
          <h3>Add from board</h3>
          <span className="board-picker-count">
            {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        <div className="board-picker-controls">
          <div className="board-picker-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search board tasks..."
              aria-label="Search board tasks"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search ? (
              <button
                type="button"
                className="board-picker-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>

          <label className="filter-select board-picker-filter">
            <SlidersHorizontal size={15} aria-hidden="true" />
            <select
              value={selectedArea}
              onChange={e => setSelectedArea(e.target.value as Category | 'All')}
              aria-label="Filter by area"
            >
              <option value="All">All areas</option>
              {areas.map(a => (
                <option key={a.id} value={a.id}>
                  {a.id}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        </div>
      </header>

      {filteredTasks.length === 0 ? (
        <div className="board-picker-empty">
          <p>No board tasks found.</p>
        </div>
      ) : (
        <ul className="board-picker-list" aria-label="Available board tasks">
          {filteredTasks.map(task => (
            <BoardPickerRow
              key={task.id}
              task={task}
              targetDate={targetDate}
              targetDayLabel={targetDayLabel}
              onAddTask={onAddTask}
              onOpenTask={onOpenTask}
              enableDrag={enableDrag}
            />
          ))}
        </ul>
      )}
    </aside>
  );
}
