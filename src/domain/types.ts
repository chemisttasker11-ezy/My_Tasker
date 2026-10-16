// Public contract: immutable task, board, planned-entry and weekly-review shapes.
export type Lane = 'urgent' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'goals';
import type { QuoteSettings } from '../lib/quotes';

export type Category = string;
export interface Area { id: string; emoji: string; tone: string }
export type Priority = 'high' | 'medium' | 'low';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type TaskStatus = 'not-started' | 'started' | 'progressing' | 'finished' | 'postponed';
export type View = 'overview' | 'board' | 'today' | 'week' | 'calendar' | 'upcoming' | 'goals' | 'completed' | 'archived' | 'settings' | 'library' | 'tracker' | 'quotes';

export interface Subtask { id: string; title: string; done: boolean }
export interface Task {
  templateId?: string;
  id: string;
  title: string;
  description: string;
  lane: Lane;
  category: Category;
  priority: Priority;
  dueDate: string;
  scheduledTime: string; // Optional HH:mm in Australia/Brisbane local time
  scheduleAnchor: string; // Original recurrence date; avoids month-end drift
  recurrence: Recurrence;
  estimateMinutes: number;
  subtasks: Subtask[];
  status: TaskStatus; // Simple state, independent of an optional checklist.
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  archivedAt: string;
  origin: 'notebook' | 'personal' | 'idea';
}
export interface Completion {
  id: string;
  taskId: string;
  title: string;
  category: Category;
  completedAt: string;
  periodKey: string;
  previousDueDate?: string;
  nextDueDate?: string;
  previousStatus?: TaskStatus;
  previousSubtasks?: Subtask[];
}
/** A commitment is a snapshot: moving or postponing a task never silently removes it from the score. */
export interface WeeklyCommitment {
  taskId: string;
  /** Distinguishes multiple independent planned copies of the same board task. */
  entryId?: string;
  title: string;
  priority: Priority;
  plannedDate: string;
}
export interface WeekReview {
  wins: string;
  blockers: string;
  adjustment: string;
  savedAt: string;
  scoreSnapshot: number | null;
}
export interface WeeklyPlan {
  weekStart: string;
  /** Optional capacity budget and the week's meaningful outcome. */
  capacityHours?: number;
  intention?: string;
  commitments: WeeklyCommitment[];
  review: WeekReview | null;
}
export interface PlannedEntry {
  id: string;
  sourceTaskId: string;
  date: string;
  order: number;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  scheduledTime: string;
  estimateMinutes: number;
  status: TaskStatus;
  subtasks: Subtask[];
  createdAt: string;
  updatedAt: string;
  /** Real completion moment, independent from which day this instance was planned for. */
  completedAt?: string;
}
/** Planned entries are snapshots: source board tasks stay reusable and unchanged. */
export interface BoardState {
  plannedEntries: PlannedEntry[];
  areas: Area[];
  quotes?: QuoteSettings;
  version: 1;
  tasks: Task[];
  completions: Completion[];
  theme: 'light' | 'dark';
  weekPlans: Record<string, WeeklyPlan>;
  dailyFocus: Record<string, string[]>;
}

