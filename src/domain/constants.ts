import type { Area, Lane } from './types';
export const LANES: { id: Lane; title: string; description: string; emoji: string; tone: string }[] = [
  { id: 'urgent', title: 'Urgent', description: 'Needs my attention', emoji: '🔥', tone: 'coral' },
  { id: 'daily', title: 'Daily', description: 'The everyday rhythm', emoji: '☀️', tone: 'sky' },
  { id: 'weekly', title: 'Weekly', description: 'Keep the momentum', emoji: '🌿', tone: 'mint' },
  { id: 'monthly', title: 'Monthly', description: 'Stay on top of things', emoji: '🗓️', tone: 'lavender' },
  { id: 'quarterly', title: 'Quarterly / Annual', description: 'Bigger picture admin', emoji: '📊', tone: 'amber' },
  { id: 'goals', title: 'Long-term goals', description: 'Life beyond the checklist', emoji: '✨', tone: 'rose' }
];

export const CATEGORIES: Area[] = [
  { id: 'ChemistTasker', emoji: '✦', tone: 'indigo' },
  { id: 'Pharmacy', emoji: '✚', tone: 'violet' },
  { id: 'Family', emoji: '♥', tone: 'pink' },
  { id: 'Finance', emoji: '$', tone: 'orange' },
  { id: 'Personal', emoji: '◉', tone: 'teal' }
];

