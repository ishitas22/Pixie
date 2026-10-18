// Wire types transcribed from pixie-api-contract.md (MVP v1).
export type Category = 'campus_events' | 'career' | 'extracurriculars' | 'personal' | 'other';
export type EventInfo = {
  date: string | null;
  time: string | null;
  location: string | null;
  registration_url: string | null;
};
export type QrCode = { id: string; payload: string; readable: boolean; isUrl: boolean; domain: string | null };
export type TaskInfo = { id?: string; title: string; due_date: string | null; completed?: boolean; kind?: 'explicit' | 'suggestion'; included?: boolean; link_url?: string | null; link_label?: string | null };
export type ItemDraft = { title: string; category: Category; summary: string; event: EventInfo | null; tasks: TaskInfo[] };
export type SavedItem = ItemDraft & { id: string; image_url: string; created_at: string; confirmed: boolean; extracted_text?: string; screenshot_id?: string; qr_codes?: QrCode[]; qr_note?: string | null };
export type AnalyzeResponse = { draft_id: string; image_url: string; extracted_text: string; item: ItemDraft; processing_status?: string; extraction_error?: string | null; filename?: string; server_revision?: number; qr_codes?: QrCode[]; qr_note?: string | null; category_known?: boolean };
export type ApiError = { error: { code: string; message: string } };
