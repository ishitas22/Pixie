import type { Category, SavedItem } from '../types/api.ts';
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dateOffset(base: Date, days: number): string {
  const date = new Date(base); date.setDate(date.getDate() + days); return localDate(date);
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
export function pendingTasks(items: SavedItem[], category: Category | 'all' = 'all') {
  return items.filter(item => item.confirmed && (category === 'all' || item.category === category)).flatMap(item => item.tasks.map((task, index) => ({ item, task, index })).filter(entry => !entry.task.completed)).sort((a, b) => (a.task.due_date ?? '9999-12-31').localeCompare(b.task.due_date ?? '9999-12-31') || a.item.title.localeCompare(b.item.title) || a.index - b.index);
}
