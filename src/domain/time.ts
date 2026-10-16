import type { Recurrence } from './types';
export function generateId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function brisbaneToday(now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => p.find(i => i.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function periodKey(recurrence: Recurrence, dateISO: string): string {
  if (recurrence === 'none') return 'once';
  if (recurrence === 'daily') return dateISO;
  const [y, m, d] = dateISO.split('-').map(Number);
  if (recurrence === 'monthly') return `${y}-${String(m).padStart(2, '0')}`;
  if (recurrence === 'quarterly') return `${y}-Q${Math.ceil(m / 3)}`;
  if (recurrence === 'yearly') return `${y}`;
  const day = new Date(Date.UTC(y, m - 1, d));
  const dow = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dow);
  return day.toISOString().slice(0, 10);
}

export function nextDueDate(date: string, recurrence: Recurrence, today: string): string {
  if (!date || recurrence === 'none') return date;
  const [year, month, day] = date.split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) return date;
  const anchor = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(anchor.getTime())) return date;
  let cursor = anchor;
  const target = today;
  // Preserve calendar anchor on monthly schedules (31st becomes month-end when shorter).
  // Jump near the desired occurrence rather than stopping after 5,000 dates.
  // Keep the original day-of-month anchor when deriving future months.
  const targetDate = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(targetDate.getTime())) return date;
  const deltaDays = Math.floor((targetDate.getTime() - anchor.getTime()) / 86400000);
  const monthsApart = (targetDate.getUTCFullYear() - year) * 12 + targetDate.getUTCMonth() - (month - 1);
  const near = recurrence === 'daily' ? deltaDays :
    recurrence === 'weekly' ? Math.floor(deltaDays / 7) :
    recurrence === 'monthly' ? monthsApart :
    recurrence === 'quarterly' ? Math.floor(monthsApart / 3) :
    Math.floor(monthsApart / 12);
  const first = Math.max(1, near);
  for (let n = first; n <= first + 4 && cursor.toISOString().slice(0, 10) <= target; n++) {
    let yearNext = year;
    let monthNext = month - 1;
    if (recurrence === 'daily') {
      cursor = new Date(anchor.getTime() + n * 86400000);
      continue;
    }
    if (recurrence === 'weekly') {
      cursor = new Date(anchor.getTime() + n * 7 * 86400000);
      continue;
    }
    if (recurrence === 'monthly') monthNext += n;
    if (recurrence === 'quarterly') monthNext += n * 3;
    if (recurrence === 'yearly') yearNext += n;
    const first = new Date(Date.UTC(yearNext, monthNext, 1));
    const finalDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, finalDay)));
  }
  return cursor.toISOString().slice(0, 10);
}

export function validISODate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function validTime(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}
