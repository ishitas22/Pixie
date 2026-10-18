import type { AnalyzeResponse, ItemDraft, SavedItem } from '../types/api.ts';
export function newId(prefix: string) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; }
// Simulates POST /api/analyze. No OCR or model is called; unknown information stays unknown.
export function analyzeScreenshot(name: string, draft_id = newId('d')): AnalyzeResponse {
  return { draft_id, image_url: `/api/drafts/${draft_id}/image`, extracted_text: '', item: { title: name.replace(/\.(png|jpe?g)$/i, ''), category: 'other', summary: '', event: null, tasks: [] } };
}
// Simulates POST /api/items with the same request and response shapes as the contract.
export function saveMockItem(request: { draft_id: string; item: ItemDraft }, id = newId('i')): SavedItem {
  return { ...request.item, id, image_url: `/api/images/${id}`, created_at: new Date().toISOString(), confirmed: true, tasks: request.item.tasks.map((task, index) => ({ title: task.title, due_date: task.due_date, id: `task_${id}_${index}`, completed: false })) };
}
export function validateImageMetadata(mime: string | undefined, name: string, size: number | undefined) {
  if (mime ? !['image/png', 'image/jpeg'].includes(mime) : !/\.(png|jpe?g)$/i.test(name)) throw new Error('Please choose a PNG or JPEG image.');
  if (size !== undefined && size > 10 * 1024 * 1024) throw new Error('That screenshot is a little large. Please choose an image under 10 MB.');
  if (size === 0) throw new Error('This file is empty. Please choose another screenshot.');
}
// PATCH /api/items/{id}: editable ItemDraft fields only; immutable saved metadata stays intact.
export function patchMockItem(existing: SavedItem, patch: Partial<ItemDraft>): SavedItem {
  const editable: Partial<ItemDraft> = {};
  if (patch.title !== undefined) editable.title = patch.title;
  if (patch.category !== undefined) editable.category = patch.category;
  if (patch.summary !== undefined) editable.summary = patch.summary;
  if (patch.event !== undefined) editable.event = patch.event;
  if (patch.tasks !== undefined) editable.tasks = patch.tasks.map(task => {
    const previous = existing.tasks.find(saved => saved.id && saved.id === task.id);
    return { title: task.title, due_date: task.due_date, id: previous?.id ?? newId('task'), completed: task.completed ?? previous?.completed ?? false };
  });
  return { ...existing, ...editable };
}
// PATCH /api/tasks/{id} completion body; returns the updated task.
export function patchMockTask(task: import('../types/api.ts').TaskInfo, patch: { completed: boolean }) {
  return { ...task, completed: patch.completed };
}
