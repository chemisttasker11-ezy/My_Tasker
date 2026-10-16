import type { BoardState, Category, Lane, Recurrence, Task } from './types';
import { CATEGORIES } from './constants';
import { generateId } from './time';
const DEFAULT_RECURRENCE: Record<Lane, Recurrence> = {
  urgent: 'none', daily: 'daily', weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', goals: 'none'
};

const seed: { lane: Lane; category: Category; title: string; recurrence?: Recurrence; priority?: Priority; description?: string }[] = [
  { lane: 'urgent', category: 'Finance', title: 'Tax', priority: 'high', description: 'Review outstanding tax paperwork and identify the next step.' },
  { lane: 'urgent', category: 'Personal', title: 'Take / book appointments', priority: 'high' },
  { lane: 'urgent', category: 'Pharmacy', title: 'Clear reports backlog', priority: 'high', description: 'Review outstanding HMR and RMMR reports.' },
  { lane: 'urgent', category: 'ChemistTasker', title: 'Claude setup', priority: 'medium', description: 'Finish the development assistant setup.' },
  { lane: 'daily', category: 'Pharmacy', title: 'Complete any reports' },
  { lane: 'daily', category: 'Family', title: 'Family time', priority: 'high' },
  { lane: 'daily', category: 'Pharmacy', title: 'Pharmacy shifts or visits' },
  { lane: 'daily', category: 'Personal', title: 'Check emails and reply' },
  { lane: 'daily', category: 'Personal', title: 'Review my tasks' },
  { lane: 'daily', category: 'Pharmacy', title: 'Training / CPD' },
  { lane: 'daily', category: 'ChemistTasker', title: 'ChemistTasker progress', priority: 'high' },
  { lane: 'weekly', category: 'Finance', title: 'Invoices for shifts' },
  { lane: 'weekly', category: 'Pharmacy', title: 'Make sure reports are sent' },
  { lane: 'weekly', category: 'Pharmacy', title: 'Check new referrals' },
  { lane: 'weekly', category: 'Family', title: 'One day outing with family', priority: 'high' },
  { lane: 'weekly', category: 'Family', title: 'Build a habit with family' },
  { lane: 'monthly', category: 'Finance', title: 'Invoices' },
  { lane: 'monthly', category: 'Finance', title: 'Claims' },
  { lane: 'monthly', category: 'Finance', title: 'Review and pay bills' },
  { lane: 'quarterly', category: 'Finance', title: 'BAS', recurrence: 'quarterly', description: 'Quarterly business activity statement.' },
  { lane: 'quarterly', category: 'Finance', title: 'Annual tax return', recurrence: 'yearly' },
  { lane: 'goals', category: 'Personal', title: 'Baladi', recurrence: 'none' },
  { lane: 'goals', category: 'Personal', title: 'Sport', recurrence: 'none' },
  { lane: 'goals', category: 'ChemistTasker', title: 'Grow ChemistTasker', recurrence: 'none' },
  { lane: 'goals', category: 'Family', title: 'Family habits', recurrence: 'none' },
  { lane: 'goals', category: 'Personal', title: 'Lose weight', recurrence: 'none' }
];

export const SUGGESTIONS = [
  { title: 'Review open PRs and staging readiness', category: 'ChemistTasker' as Category, lane: 'weekly' as Lane, description: 'Optional idea based on current SaaS work.' },
  { title: 'Plan ChemistTasker brand identity variants', category: 'ChemistTasker' as Category, lane: 'weekly' as Lane, description: 'Logo for mobile, compact mark, icon and wordmark.' },
  { title: 'Reconcile HMR / RMMR referral pipeline', category: 'Pharmacy' as Category, lane: 'weekly' as Lane, description: 'Review referrals, completed reports and follow-up status.' },
  { title: 'Plan next CPD topic', category: 'Pharmacy' as Category, lane: 'monthly' as Lane, description: 'Optional professional development planning.' }
];

export function createTask(values: Partial<Task> & Pick<Task, 'title'>): Task {
  const now = new Date().toISOString();
  const lane = values.lane ?? 'urgent';
  return {
    id: values.id ?? generateId(),
    templateId: values.templateId,
    title: values.title.trim(),
    description: values.description ?? '',
    lane,
    category: values.category ?? 'Personal',
    priority: values.priority ?? 'medium',
    dueDate: values.dueDate ?? '',
    scheduledTime: values.scheduledTime ?? '',
    scheduleAnchor: values.scheduleAnchor ?? values.dueDate ?? '',
    recurrence: values.recurrence ?? DEFAULT_RECURRENCE[lane],
    estimateMinutes: values.estimateMinutes ?? 0,
    subtasks: values.subtasks ?? [],
    status: values.status ?? 'not-started',
    createdAt: values.createdAt ?? now,
    updatedAt: now,
    completedAt: values.completedAt ?? '',
    archivedAt: values.archivedAt ?? '',
    origin: values.origin ?? 'personal'
  };
}

export function initialState(): BoardState {
  return { version: 1, areas: CATEGORIES.map(a => ({ ...a })), theme: 'light', completions: [], plannedEntries: [], weekPlans: {}, dailyFocus: {}, tasks: seed.map((t, i) => createTask({ ...t, id: `notebook-${i + 1}`, origin: 'notebook' })) };
}

