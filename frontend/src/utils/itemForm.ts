import type { ItemDraft } from '../types/api.ts';
import { formatDate, parseDate } from './dates.ts';
import { normalizeDraft, validateDraft } from './confirmation.ts';
// Display-only form model. Only toApiItem results may enter the shared/API state.
export type ItemFormValues = ItemDraft;
export function toItemForm(item: ItemDraft): ItemFormValues {
  return { ...item, event: item.event ? { ...item.event, date: formatDate(item.event.date) || null } : null, tasks: item.tasks.map(task => ({ ...task, due_date: formatDate(task.due_date) || null })) };
}
export function toApiItem(form: ItemFormValues, preserveTaskState = false) {
  const dateErrors: Record<string, string> = {};
  const convert = (value: string | null, key: string) => {
    if (!value?.trim()) return null;
    const parsed = parseDate(value);
    if (!parsed) dateErrors[key] = 'Use a real date in MM/DD/YYYY format.';
    return parsed;
  };
  const item = normalizeDraft({ ...form, event: form.event ? { ...form.event, date: convert(form.event.date, 'date') } : null, tasks: form.tasks.map((task, index) => ({ ...task, due_date: convert(task.due_date, `due_${index}`) })) }, preserveTaskState);
  return { item, dateErrors, errors: { ...validateDraft(item), ...dateErrors } };
}
