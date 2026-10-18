// Wire types transcribed from pixie-api-contract.md (MVP v1).
export type Category = 'campus_events' | 'career' | 'extracurriculars' | 'personal' | 'other';
export type EventInfo = {
  date: string | null;
  time: string | null;
  location: string | null;
  registration_url: string | null;
};
export type TaskInfo = { id?: string; title: string; due_date: string | null; completed?: boolean };
export type ItemDraft = { title: string; category: Category; summary: string; event: EventInfo | null; tasks: TaskInfo[] };
export type SavedItem = ItemDraft & { id: string; image_url: string; created_at: string; confirmed: boolean };
export type AnalyzeResponse = { draft_id: string; image_url: string; extracted_text: string; item: ItemDraft };
export type ApiError = { error: { code: string; message: string } };
