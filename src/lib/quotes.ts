import type { Task } from '../model';

export interface Quote { id: string; text: string; theme: string }
export interface QuoteSettings { direction: string; custom: Quote[]; daily: Record<string, string> }
export const DEFAULT_DIRECTION = 'Build a life with room for the people, purpose and moments that matter.';
const themes: Record<string, string[]> = {
  Momentum: ['One small step still moves you forward.', 'Start with the next useful thing.', 'Progress grows from showing up, not from doing everything.', 'Give today a direction, then take one step.', 'You can begin again at any point in the day.', 'A manageable plan is a powerful plan.'],
  Joy: ['Make room for one thing that makes you smile.', 'Let a good moment count, even on a difficult day.', 'A little laughter belongs on the plan too.', 'Notice what is working, however small.', 'You do not have to earn every moment of joy.', 'Look up; there may be a good moment waiting.'],
  Balance: ['Your energy matters as much as your output.', 'Rest can be part of moving forward.', 'Leave a little room for being human.', 'A full life needs breathing space.', 'Choose a pace you can return to tomorrow.', 'You are more than the boxes you tick.'],
  Connection: ['Give your attention to someone who matters.', 'Small moments of care make a life feel rich.', 'Being present is something you can give today.', 'Make space for a conversation, not just a task.', 'The people you love belong in your plans.', 'A thoughtful check-in can brighten two days.'],
  Clarity: ['Clear one small space; make the next step easier.', 'Organise enough to help yourself, not to chase perfection.', 'Give each loose end a next step.', 'A little order today can make tomorrow lighter.', 'Focus on what deserves your attention now.', 'Keep the useful; make room for what matters.'],
  Courage: ['You can take a small step before you feel fully ready.', 'Learning begins where certainty ends.', 'Let curiosity be stronger than the need to get it perfect.', 'Trying is a real part of progress.', 'The next chapter can start with a modest action.', 'Make a plan that gives your hopes somewhere to go.']
};
export const QUOTE_LIBRARY: Quote[] = Object.entries(themes).flatMap(([theme, texts]) => texts.map((text, i) => ({ id: `${theme.toLowerCase()}-${i}`, text, theme })));
export const quoteSettings = (value?: QuoteSettings): QuoteSettings => value ?? { direction: DEFAULT_DIRECTION, custom: [], daily: {} };
export function validateQuoteSettings(value: unknown): QuoteSettings {
  if (value === undefined) return quoteSettings();
  if (!value || typeof value !== 'object') throw new Error('Invalid quote settings.');
  const q = value as QuoteSettings;
  if (typeof q.direction !== 'string' || q.direction.length > 240 || !Array.isArray(q.custom) || q.custom.length > 100 ||
    !q.daily || typeof q.daily !== 'object' || Array.isArray(q.daily) || Object.keys(q.daily).length > 1500) throw new Error('Invalid quote settings.');
  const ids = new Set(QUOTE_LIBRARY.map(item => item.id));
  const custom = q.custom.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 240) throw new Error('Invalid custom quote.');
    ids.add(item.id); return { id: item.id, text: item.text.trim(), theme: 'My quotes' };
  });
  const daily: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [date, text] of Object.entries(q.daily)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime()) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date || typeof text !== 'string' || !text.trim() || text.length > 240) throw new Error('Invalid daily quote.');
    daily[date] = text;
  }
  return { direction: q.direction.trim(), custom, daily };
}
export function suggestedTheme(tasks: Task[]): string {
  const words = tasks.map(t => `${t.title} ${t.category}`).join(' ').toLowerCase();
  if (/family|friend|household|connection|together/.test(words)) return 'Connection';
  if (/rest|sleep|wellbeing|movement|break/.test(words)) return 'Balance';
  if (/learn|skill|goal|project|study/.test(words)) return 'Courage';
  if (/clean|organis|tidy|paperwork|finance/.test(words)) return 'Clarity';
  return tasks.length ? 'Momentum' : 'Joy';
}
export function dailyQuote(settings: QuoteSettings | undefined, date: string, tasks: Task[]): { text: string; theme: string; custom: boolean } {
  const q = quoteSettings(settings);
  if (q.daily[date]) return { text: q.daily[date], theme: 'Chosen by you', custom: true };
  const theme = suggestedTheme(tasks);
  const options = QUOTE_LIBRARY.filter(item => item.theme === theme);
  const seed = [...date].reduce((sum, ch) => sum * 31 + ch.charCodeAt(0) >>> 0, 0);
  return { text: options[seed % options.length].text, theme, custom: false };
}
