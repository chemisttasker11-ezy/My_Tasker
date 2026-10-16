import { brisbaneToday, type Priority } from '../model';
import { addDays } from './calendar';

// If limit in src/model.ts is not exported, fallback to 120 per production plan
export const MAX_TITLE_LENGTH = 120;

export interface ParsedQuickAdd {
  title: string;
  priority?: Priority;
  due?: string;
}

/**
 * Pure smart parsing for quick add.
 * - Trailing "!" sets priority to high.
 * - "today" or "tomorrow" as the last word sets a due date.
 * - Titles exceeding MAX_TITLE_LENGTH (120) are cut.
 *
 * @param text The raw input string
 * @param todayISO Optional ISO date string (YYYY-MM-DD) for 'today'; defaults to brisbaneToday()
 */
export function parseQuickAdd(text: string, todayISO?: string): ParsedQuickAdd {
  let current = text.trim();
  let priority: Priority | undefined = undefined;
  let due: string | undefined = undefined;

  const baseToday = todayISO && /^\d{4}-\d{2}-\d{2}$/.test(todayISO) ? todayISO : brisbaneToday();
  const baseTomorrow = addDays(baseToday, 1);

  // Check for trailing exclamation mark(s), e.g. "Fix bug!" or "Fix bug !"
  if (current.endsWith('!')) {
    priority = 'high';
    current = current.replace(/!+$/, '').trimEnd();
  }

  // Check if the last word is "today" or "tomorrow" (case-insensitive)
  const dateMatch = current.match(/(?:^|\s+)(today|tomorrow)$/i);
  if (dateMatch) {
    const word = dateMatch[1].toLowerCase();
    due = word === 'today' ? baseToday : baseTomorrow;
    current = current.slice(0, -dateMatch[0].length).trimEnd();
  }

  // Check for trailing '!' before the date word, e.g. "Fix bug ! today"
  if (current.endsWith('!')) {
    priority = 'high';
    current = current.replace(/!+$/, '').trimEnd();
  }

  // Cut title exceeding max allowed length
  const title = current.slice(0, MAX_TITLE_LENGTH).trim();

  const result: ParsedQuickAdd = { title };
  if (priority) {
    result.priority = priority;
  }
  if (due) {
    result.due = due;
  }

  return result;
}
