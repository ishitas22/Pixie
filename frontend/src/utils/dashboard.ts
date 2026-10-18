import type { Category, SavedItem } from '../types/api.ts';
/** Calendar day in America/New_York. A date-only deadline stays on that day. */
export function localDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}
export function dateOffset(base: Date, days: number): string {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export { formatDate as displayDate } from './dates.ts';
export function displayTime(time: string | null): string {
  if (!time) return 'Time to be announced';
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}
export type AgendaEntry = { key: string; item: SavedItem; date: string; time: string | null; kind: 'event' | 'task'; taskTitle?: string };
export function getAgenda(items: SavedItem[], today: string, category: Category | 'all' = 'all') {
  const entries: AgendaEntry[] = [];
  for (const item of items) {
    if (!item.confirmed || (category !== 'all' && item.category !== category)) continue;
    if (item.event?.date && item.event.date >= today) entries.push({ key: `${item.id}-event`, item, date: item.event.date, time: item.event.time, kind: 'event' });
    for (const [index, task] of item.tasks.entries()) {
      if (!task.completed && task.due_date) entries.push({ key: `${item.id}-task-${task.id ?? index}`, item, date: task.due_date, time: null, kind: 'task', taskTitle: task.title });
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '23:59').localeCompare(b.time ?? '23:59') || a.key.localeCompare(b.key));
  return { today: entries.filter(entry => entry.date === today || (entry.kind === 'task' && entry.date < today)), upcoming: entries.filter(entry => entry.date > today) };
}
export type SnapLine = { key: string; title: string; detail: string; itemId: string; kind: 'task' | 'event' };
export type SnapLater = { key: string; title: string; itemId: string };
export function daySnap(items: SavedItem[], today: string, category: Category | 'all' = 'all') {
  const scoped = items.filter(item => item.confirmed && (category === 'all' || item.category === category));
  const lines: SnapLine[] = [];
  for (const item of scoped) {
    if (item.event?.date === today) {
      lines.push({ key: `${item.id}-event`, title: item.title, detail: item.event.time ? displayTime(item.event.time) : '', itemId: item.id, kind: 'event' });
    }
    for (const [index, task] of item.tasks.entries()) {
      if (!task.completed && task.due_date === today) {
        lines.push({ key: `${item.id}-task-${task.id ?? index}`, title: task.title, detail: item.title, itemId: item.id, kind: 'task' });
      }
    }
  }
  const laterTask = scoped.flatMap(item => item.tasks.filter(task => !task.completed && !task.due_date).map((task, index) => ({ item, task, index })))[0];
  const later: SnapLater | null = laterTask ? { key: `${laterTask.item.id}-later-${laterTask.task.id ?? laterTask.index}`, title: laterTask.task.title, itemId: laterTask.item.id } : null;
  return { count: lines.length, lines: lines.slice(0, 3), later };
}
export function pendingTasks(items: SavedItem[], category: Category | 'all' = 'all') {
  return items.filter(item => item.confirmed && (category === 'all' || item.category === category)).flatMap(item => item.tasks.map((task, index) => ({ item, task, index })).filter(entry => !entry.task.completed)).sort((a, b) => (a.task.due_date ?? '9999-12-31').localeCompare(b.task.due_date ?? '9999-12-31') || a.item.title.localeCompare(b.item.title) || a.index - b.index);
}
