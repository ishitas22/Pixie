import type { Category, SavedItem } from '../types/api.ts';
import { isIsoDate } from './dates.ts';
export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split('-').map(Number);
  const total = year * 12 + number - 1 + offset;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String(((total % 12) + 12) % 12 + 1).padStart(2, '0')}`;
}
export function monthCells(month: string): (string | null)[] {
  const first = new Date(`${month}-01T12:00:00Z`);
  const next = new Date(`${shiftMonth(month, 1)}-01T12:00:00Z`);
  const days = Math.round((next.getTime() - first.getTime()) / 86400000);
  const offset = first.getUTCDay();
  return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => index >= offset && index < offset + days ? `${month}-${String(index - offset + 1).padStart(2, '0')}` : null);
}
export function calendarEvents(items: SavedItem[], category: Category | 'all' = 'all'): SavedItem[] {
  return items.filter(item => item.confirmed && item.event?.date && isIsoDate(item.event.date) && (category === 'all' || item.category === category)).sort((a, b) => a.event!.date!.localeCompare(b.event!.date!) || (a.event!.time ?? '').localeCompare(b.event!.time ?? '') || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}
export function eventsOnDate(items: SavedItem[], date: string): SavedItem[] { return items.filter(item => item.event?.date === date); }
