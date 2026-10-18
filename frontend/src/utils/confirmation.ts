import type { ItemDraft } from '../types/api.ts';
import { isIsoDate as validDate } from './dates.ts';
export { isIsoDate as validDate } from './dates.ts';
export function validUrl(value: string): boolean {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname); } catch { return false; }
}
export function validateDraft(item: ItemDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!item.title.trim()) errors.title = 'Give your screenshot a title.';
  if (!['campus_events', 'career', 'extracurriculars', 'personal', 'other'].includes(item.category)) errors.category = 'Choose a category.';
  if (item.event?.date && !validDate(item.event.date)) errors.date = 'Use a real date in MM/DD/YYYY format.';
  if (item.event?.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.event.time)) errors.time = 'Use HH:MM in 24-hour time.';
  if (item.event?.registration_url && !validUrl(item.event.registration_url)) errors.registration_url = 'Enter a full http:// or https:// URL.';
  item.tasks.forEach((task, index) => { if (!task.title.trim()) errors[`task_${index}`] = 'Enter a task title or remove this task.'; if (task.due_date && !validDate(task.due_date)) errors[`due_${index}`] = 'Use a real date in MM/DD/YYYY format.'; });
  return errors;
}
export function normalizeDraft(item: ItemDraft, preserveTaskState = false): ItemDraft {
  const optional = (text: string | null) => text?.trim() || null;
  const event = item.event ? { date: optional(item.event.date), time: optional(item.event.time), location: optional(item.event.location), registration_url: optional(item.event.registration_url) } : null;
  return { title: item.title.trim(), category: item.category, summary: item.summary.trim(), event: event && Object.values(event).some(Boolean) ? event : null, tasks: item.tasks.map(task => ({ ...(preserveTaskState ? task : {}), title: task.title.trim(), due_date: optional(task.due_date) })) };
}
