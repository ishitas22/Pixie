import type {
  Category,
  Dashboard,
  DashboardLine,
  GalleryImage,
  Health,
  ImportResult,
  ItemTask,
  SimilarImage,
  RegistrationStatus,
  ReviewStatus,
  SavedItem,
  SavedTask,
  Screenshot,
  TaskCalendar,
  CalendarTask,
  TaskStatus,
} from "./types";
import { CATEGORIES } from "./types";

export const API_BASE = "http://127.0.0.1:8000";

export class PixieApiError extends Error {
  readonly code: string;
  readonly screenshot?: Screenshot;
  readonly items?: SavedItem[];
  readonly similar: SimilarImage[];

  constructor(
    code: string,
    message: string,
    screenshot?: Screenshot,
    items?: SavedItem[],
    similar: SimilarImage[] = [],
  ) {
    super(message);
    this.name = "PixieApiError";
    this.code = code;
    this.screenshot = screenshot;
    this.items = items;
    this.similar = similar;
  }
}

export function imageUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE}${path}`;
}

export function messageOf(error: unknown): string {
  if (error instanceof PixieApiError) {
    return error.message;
  }
  return "Something went wrong while talking to the local Pixie API.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asCategory(value: unknown): Category {
  if (typeof value === "string" && (CATEGORIES as readonly string[]).includes(value)) {
    return value as Category;
  }
  return "Other";
}

function textOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toScreenshot(value: unknown): Screenshot | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.ocr_text !== "string") {
    return undefined;
  }
  return {
    id: value.id,
    filename: typeof value.filename === "string" ? value.filename : "screenshot",
    displayTitle: textOrEmpty(value.display_title),
    draftTitle: textOrEmpty(value.draft_title),
    category: typeof value.category === "string" && (CATEGORIES as readonly string[]).includes(value.category) ? (value.category as Category) : null,
    draftCategory:
      typeof value.draft_category === "string" && (CATEGORIES as readonly string[]).includes(value.draft_category)
        ? (value.draft_category as Category)
        : null,
    summary: textOrEmpty(value.summary),
    ambiguities: textOrEmpty(value.ambiguities),
    titleLocked: Boolean(value.title_locked),
    imageUrl: typeof value.image_url === "string" ? value.image_url : "",
    ocrText: value.ocr_text,
    createdAt: typeof value.created_at === "string" ? value.created_at : "",
    processingStatus: typeof value.processing_status === "string" ? value.processing_status : "ready",
    extractionError: typeof value.extraction_error === "string" ? value.extraction_error : null,
  };
}

function toItemTask(value: unknown): ItemTask {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected action.");
  }
  const status = value.status;
  return {
    id: value.id,
    title: value.title,
    details: textOrEmpty(value.details),
    deadline: textOrEmpty(value.deadline),
    dueTime: textOrEmpty(value.due_time),
    supportingText: textOrEmpty(value.supporting_text),
    status: status === "suggested" || status === "accepted" || status === "discarded" ? status : "suggested",
    kind: value.kind === "suggestion" ? "suggestion" : "explicit",
    dateAmbiguous: Boolean(value.date_ambiguous),
    completed: Boolean(value.completed),
  };
}

export function toItem(value: unknown): SavedItem {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected item.");
  }
  const event = isRecord(value.event) ? value.event : null;
  const registration = isRecord(value.registration) ? value.registration : {};
  const review = value.review_status === "confirmed" ? "confirmed" : "needs_review";
  const registrationStatus = registration.status;
  return {
    id: value.id,
    screenshotId: textOrEmpty(value.screenshot_id),
    title: value.title,
    summary: textOrEmpty(value.summary),
    category: asCategory(value.category),
    reviewStatus: review as ReviewStatus,
    supportingText: textOrEmpty(value.supporting_text),
    missing: Array.isArray(value.missing) ? value.missing.filter((item) => typeof item === "string") : [],
    dateText: event ? textOrEmpty(event.date_text) : "",
    eventDate: event ? textOrEmpty(event.event_date) : "",
    endDate: event ? textOrEmpty(event.end_date) : "",
    startTime: event ? textOrEmpty(event.start_time) : "",
    endTime: event ? textOrEmpty(event.end_time) : "",
    timezone: event ? textOrEmpty(event.timezone) : "",
    location: event ? textOrEmpty(event.location) : "",
    meetingUrl: event ? textOrEmpty(event.meeting_url) : "",
    onCalendar: Boolean(event?.on_calendar),
    registrationRequired: typeof registration.required === "boolean" ? registration.required : null,
    registrationUrl: textOrEmpty(registration.url),
    registrationDeadline: textOrEmpty(registration.deadline),
    registrationStatus:
      registrationStatus === "registered" || registrationStatus === "not_registered" ? registrationStatus : "unknown",
    tasks: Array.isArray(value.tasks) ? value.tasks.map(toItemTask) : [],
  };
}

function toTask(value: unknown): SavedTask {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected task.");
  }
  return {
    id: value.id,
    screenshotId: typeof value.screenshot_id === "string" ? value.screenshot_id : "",
    itemId: typeof value.item_id === "string" ? value.item_id : null,
    title: value.title,
    details: typeof value.details === "string" ? value.details : null,
    category: asCategory(value.category),
    deadline: typeof value.deadline === "string" ? value.deadline : null,
    supportingText: typeof value.supporting_text === "string" ? value.supporting_text : "",
    completed: Boolean(value.completed),
    createdAt: typeof value.created_at === "string" ? value.created_at : "",
    completedAt: typeof value.completed_at === "string" ? value.completed_at : null,
    imageUrl: typeof value.image_url === "string" ? value.image_url : "",
    filename: typeof value.filename === "string" ? value.filename : "screenshot",
    sourceTitle: textOrEmpty(value.source_title) || "Untitled screenshot",
    kind: value.kind === "suggestion" ? "suggestion" : "explicit",
    dateAmbiguous: Boolean(value.date_ambiguous),
    eventDate: typeof value.event_date === "string" ? value.event_date : null,
  };
}

function toGallery(value: unknown): GalleryImage {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected gallery image.");
  }
  return {
    id: value.id,
    filename: textOrEmpty(value.filename) || "screenshot",
    title: textOrEmpty(value.title) || "Untitled screenshot",
    imageUrl: textOrEmpty(value.image_url),
    createdAt: textOrEmpty(value.created_at),
    processingStatus: textOrEmpty(value.processing_status) || "ready",
    extractionError: typeof value.extraction_error === "string" ? value.extraction_error : null,
    categories: Array.isArray(value.categories) ? value.categories.filter((item) => typeof item === "string") : [],
    itemCount: typeof value.item_count === "number" ? value.item_count : 0,
    needsReview: Boolean(value.needs_review),
  };
}

function lineFrom(value: unknown, whenKey: string): DashboardLine {
  if (!isRecord(value) || typeof value.title !== "string") {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected dashboard row.");
  }
  const when = textOrEmpty(value[whenKey]);
  const time = textOrEmpty(value.start_time || value.due_time);
  const place = textOrEmpty(value.location);
  return {
    title: value.title,
    category: textOrEmpty(value.category),
    when: [when, time].filter(Boolean).join(" "),
    extra: place,
  };
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function errorFrom(body: unknown, status: number): PixieApiError {
  if (isRecord(body) && typeof body.error === "string" && typeof body.message === "string") {
    const screenshot = toScreenshot(body.screenshot);
    const items =
      isRecord(body.screenshot) && Array.isArray(body.screenshot.items) ? body.screenshot.items.map(toItem) : undefined;
    const similar = Array.isArray(body.similar) ? body.similar.map(toSimilar).filter((item) => item !== null) : [];
    return new PixieApiError(body.error, body.message, screenshot, items, similar);
  }
  if (status === 413) {
    return new PixieApiError("file_too_large", "That image is larger than 8 MB.");
  }
  return new PixieApiError("request_failed", "The request was not valid. Check the fields and try again.");
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) {
    headers.set("Accept", "application/json");
    if (init?.body) {
      headers.set("Content-Type", "application/json");
    }
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new PixieApiError(
      "network",
      `Could not reach the Pixie API at ${API_BASE}. Start the backend and try again.`,
    );
  }
  const body = await readBody(response);
  if (!response.ok) {
    throw errorFrom(body, response.status);
  }
  return body;
}

export async function getHealth(): Promise<Health> {
  const body = await request("/api/health");
  if (!isRecord(body) || !isRecord(body.ollama) || !isRecord(body.tesseract)) {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected status.");
  }
  return {
    ok: Boolean(body.ok),
    ollama: {
      ok: Boolean(body.ollama.ok),
      message: typeof body.ollama.message === "string" ? body.ollama.message : "Ollama is unavailable.",
    },
    tesseract: {
      ok: Boolean(body.tesseract.ok),
      message:
        typeof body.tesseract.message === "string" ? body.tesseract.message : "Tesseract is unavailable.",
    },
    categories: Array.isArray(body.categories) ? body.categories.filter((item) => typeof item === "string") : [],
    timezone: typeof body.timezone === "string" ? body.timezone : "America/New_York",
  };
}

function toSimilar(value: unknown): SimilarImage | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }
  const filename = textOrEmpty(value.filename) || "screenshot";
  return {
    id: value.id,
    filename,
    title: textOrEmpty(value.title) || filename,
    imageUrl: textOrEmpty(value.image_url),
    distance: typeof value.distance === "number" ? value.distance : 0,
  };
}

function importFrom(body: unknown): ImportResult {
  if (!isRecord(body)) {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected import.");
  }
  const screenshot = toScreenshot(body.screenshot);
  if (!screenshot || !isRecord(body.screenshot) || !Array.isArray(body.screenshot.items)) {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected import.");
  }
  const similar = Array.isArray(body.similar) ? body.similar.map(toSimilar).filter((item) => item !== null) : [];
  return {
    screenshot,
    items: body.screenshot.items.map(toItem),
    notice: typeof body.notice === "string" ? body.notice : null,
    similar,
  };
}

export async function uploadScreenshot(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  return importFrom(await request("/api/screenshots", { method: "POST", body: form }));
}

export async function deleteScreenshot(screenshotId: string): Promise<void> {
  await request(`/api/screenshots/${screenshotId}`, { method: "DELETE" });
}

export async function interpretScreenshot(screenshotId: string): Promise<ImportResult> {
  return importFrom(await request(`/api/screenshots/${screenshotId}/interpret`, { method: "POST" }));
}

export async function getTasks(): Promise<SavedTask[]> {
  const body = await request("/api/tasks");
  if (!Array.isArray(body)) {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected task list.");
  }
  return body.map(toTask);
}

export async function getScreenshotDetail(screenshotId: string): Promise<ImportResult> {
  const body = await request(`/api/screenshots/${screenshotId}`);
  return importFrom({ screenshot: body, notice: null });
}

export async function getGallery(category: string): Promise<GalleryImage[]> {
  const query = new URLSearchParams({ category });
  const body = await request(`/api/screenshots?${query.toString()}`);
  if (!Array.isArray(body)) {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected gallery.");
  }
  return body.map(toGallery);
}

export async function getDashboard(): Promise<Dashboard> {
  const body = await request("/api/dashboard");
  if (!isRecord(body)) {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected dashboard.");
  }
  const lines = (key: string, whenKey: string) =>
    Array.isArray(body[key]) ? body[key].map((row) => lineFrom(row, whenKey)) : [];
  return {
    timezone: textOrEmpty(body.timezone) || "America/New_York",
    todayDate: textOrEmpty(body.today_date),
    todayEvents: lines("today_events", "event_date"),
    todayTasks: lines("today_tasks", "deadline"),
    overdueTasks: lines("overdue_tasks", "deadline"),
    upcomingEvents: lines("upcoming_events", "event_date"),
    upcomingTasks: lines("upcoming_tasks", "deadline"),
    needsReview: Array.isArray(body.needs_review) ? body.needs_review.length : 0,
  };
}

export type ItemDraft = {
  title: string;
  summary: string;
  category: Category;
  supportingText: string;
  eventDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  location: string;
  meetingUrl: string;
  registrationRequired: boolean | null;
  registrationUrl: string;
  registrationDeadline: string;
  registrationStatus: RegistrationStatus;
};

function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function saveItem(itemId: string, draft: ItemDraft): Promise<SavedItem> {
  return toItem(
    await request(`/api/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: draft.title.trim(),
        summary: blank(draft.summary),
        category: draft.category,
        supporting_text: draft.supportingText.trim(),
        event_date: blank(draft.eventDate),
        end_date: blank(draft.endDate),
        start_time: blank(draft.startTime),
        end_time: blank(draft.endTime),
        location: blank(draft.location),
        meeting_url: blank(draft.meetingUrl),
        registration_required: draft.registrationRequired,
        registration_url: blank(draft.registrationUrl),
        registration_deadline: blank(draft.registrationDeadline),
        registration_status: draft.registrationStatus,
      }),
    }),
  );
}

export async function confirmItem(itemId: string): Promise<SavedItem> {
  return toItem(await request(`/api/items/${itemId}/confirm`, { method: "POST" }));
}

export async function setOnCalendar(itemId: string, onCalendar: boolean): Promise<SavedItem> {
  return toItem(
    await request(`/api/items/${itemId}/calendar`, {
      method: "POST",
      body: JSON.stringify({ on_calendar: onCalendar }),
    }),
  );
}

export async function updateTask(
  taskId: string,
  patch: {
    status?: TaskStatus;
    title?: string;
    deadline?: string | null;
    dueTime?: string | null;
    completed?: boolean;
  },
): Promise<SavedTask> {
  const body: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    body.status = patch.status;
  }
  if (patch.title !== undefined) {
    body.title = patch.title;
  }
  if (patch.deadline !== undefined) {
    body.due_date = patch.deadline;
  }
  if (patch.dueTime !== undefined) {
    body.due_time = patch.dueTime;
  }
  if (patch.completed !== undefined) {
    body.completed = patch.completed;
  }
  return toTask(
    await request(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
}

function toCalendarTask(value: unknown): CalendarTask {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected calendar task.");
  }
  return {
    id: value.id,
    screenshotId: textOrEmpty(value.screenshot_id),
    itemId: typeof value.item_id === "string" ? value.item_id : null,
    title: value.title,
    details: typeof value.details === "string" ? value.details : null,
    category: asCategory(value.category),
    deadline: typeof value.deadline === "string" ? value.deadline : null,
    dueTime: typeof value.due_time === "string" ? value.due_time : null,
    deadlineText: typeof value.deadline_text === "string" ? value.deadline_text : null,
    supportingText: textOrEmpty(value.supporting_text),
    completed: Boolean(value.completed),
    overdue: Boolean(value.overdue),
    dateNeedsReview: Boolean(value.date_needs_review),
    imageUrl: textOrEmpty(value.image_url),
    filename: textOrEmpty(value.filename),
    sourceTitle: textOrEmpty(value.source_title) || "Untitled screenshot",
  };
}

export async function getTaskCalendar(start: string, end: string): Promise<TaskCalendar> {
  const query = new URLSearchParams({ start, end });
  const body = await request(`/api/task-calendar?${query.toString()}`);
  if (!isRecord(body) || !Array.isArray(body.tasks) || !Array.isArray(body.undated)) {
    throw new PixieApiError("request_failed", "Pixie returned an unexpected calendar.");
  }
  return {
    timezone: textOrEmpty(body.timezone) || "America/New_York",
    today: textOrEmpty(body.today),
    tasks: body.tasks.map(toCalendarTask),
    undated: body.undated.map(toCalendarTask),
    needsDateReview: Array.isArray(body.needs_date_review) ? body.needs_date_review.map(toCalendarTask) : [],
  };
}

export async function getGoogleCalendarUrl(itemId: string, endTime?: string, endDate?: string): Promise<string> {
  const query = new URLSearchParams();
  if (endTime) {
    query.set("end_time", endTime);
  }
  if (endDate) {
    query.set("end_date", endDate);
  }
  const suffix = query.toString();
  const body = await request(`/api/items/${itemId}/google-calendar${suffix ? `?${suffix}` : ""}`);
  if (!isRecord(body) || typeof body.url !== "string") {
    throw new PixieApiError("request_failed", "Pixie did not return a Google Calendar link.");
  }
  return body.url;
}

export async function addItemTask(itemId: string, title: string): Promise<SavedTask> {
  return toTask(
    await request(`/api/items/${itemId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ title, supporting_text: title }),
    }),
  );
}

export async function addManualItem(screenshotId: string, title: string, category: Category): Promise<SavedItem> {
  return toItem(
    await request(`/api/screenshots/${screenshotId}/items`, {
      method: "POST",
      body: JSON.stringify({ title, category, supporting_text: title }),
    }),
  );
}

export async function approveScreenshot(
  screenshotId: string,
  body: {
    title: string;
    category: Category;
    summary?: string | null;
    taskIds: string[];
    tasks?: { id: string; title: string }[];
    items?: {
      id: string;
      title?: string;
      eventDate?: string;
      endDate?: string;
      startTime?: string;
      endTime?: string;
      location?: string;
      meetingUrl?: string;
    }[];
  },
): Promise<ImportResult> {
  return importFrom(
    await request(`/api/screenshots/${screenshotId}/approve`, {
      method: "POST",
      body: JSON.stringify({
        title: body.title,
        category: body.category,
        summary: body.summary ?? null,
        task_ids: body.taskIds,
        tasks: (body.tasks ?? []).map((task) => ({ id: task.id, title: task.title })),
        items: (body.items ?? []).map((item) => ({
          id: item.id,
          title: item.title ?? null,
          event_date: item.eventDate ? item.eventDate : null,
          end_date: item.endDate ? item.endDate : null,
          start_time: item.startTime ? item.startTime : null,
          end_time: item.endTime ? item.endTime : null,
          location: item.location ? item.location : null,
          meeting_url: item.meetingUrl ? item.meetingUrl : null,
        })),
      }),
    }),
  );
}

export async function reanalyze(screenshotId: string): Promise<ImportResult> {
  return importFrom(await request(`/api/screenshots/${screenshotId}/reanalyze`, { method: "POST" }));
}

export async function setTaskCompleted(taskId: string, completed: boolean): Promise<SavedTask> {
  return toTask(
    await request(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ completed }),
    }),
  );
}
