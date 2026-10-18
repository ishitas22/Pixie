import { imageUrl } from "../api";
import type { LocalImage } from "../state/model";
import type { ImportResult, ItemTask, SavedItem as ApiItem, Screenshot } from "../types";
import type { AnalyzeResponse, Category, EventInfo, ItemDraft, SavedItem, TaskInfo } from "../types/api";

export const TO_API_CATEGORY = {
  campus_events: "Campus events",
  career: "Career Opportunities",
  extracurriculars: "Extracurriculars",
  personal: "Personal",
  other: "Other",
} as const;

export type ApiCategoryName = (typeof TO_API_CATEGORY)[Category];

export function toContractCategory(value: string | null | undefined): Category {
  return readingCategory(value) ?? "other";
}

/** A category the reading actually returned. Missing categories stay unset. */
export function readingCategory(value: string | null | undefined): Category | null {
  const found = (Object.entries(TO_API_CATEGORY) as [Category, string][]).find(([, label]) => label === value);
  return found?.[0] ?? null;
}

export function toApiCategory(value: Category): ApiCategoryName {
  return TO_API_CATEGORY[value];
}

function eventInfo(item: ApiItem): EventInfo | null {
  const event: EventInfo = {
    date: item.eventDate || null,
    time: item.startTime || null,
    location: item.location || null,
    registration_url: item.registrationUrl || null,
  };
  const hasEvent = Boolean(
    event.date ||
      event.time ||
      event.location ||
      event.registration_url ||
      item.endDate ||
      item.endTime ||
      item.meetingUrl ||
      item.dateText,
  );
  return hasEvent ? event : null;
}

function taskInfo(task: ItemTask, acceptedOnly: boolean): TaskInfo | null {
  if (task.status === "discarded") {
    return null;
  }
  if (acceptedOnly && task.status !== "accepted") {
    return null;
  }
  return {
    id: task.id,
    title: task.title,
    due_date: task.deadline || null,
    completed: task.completed,
    kind: task.kind,
    included: task.kind !== "suggestion" || task.status === "accepted",
    link_url: task.linkUrl || null,
    link_label: task.linkLabel || null,
  };
}

/** Prefer a model or item title. A bare filename is not a generated title. */
export function generatedTitle(shot: Screenshot, items: ApiItem[]): string {
  const filename = shot.filename.trim();
  const candidates = [shot.draftTitle, shot.displayTitle, ...items.map((item) => item.title)];
  for (const value of candidates) {
    const title = value.trim();
    if (title && title !== filename && title !== "Untitled screenshot") {
      return title;
    }
  }
  return "";
}

export function needsReview(result: ImportResult): boolean {
  if (result.items.some((item) => item.reviewStatus !== "confirmed")) {
    return true;
  }
  return result.screenshot.processingStatus !== "ready";
}

export function imageFor(shot: Screenshot): LocalImage {
  return {
    uri: imageUrl(shot.imageUrl),
    name: shot.filename || "screenshot",
    uploaded_at: shot.createdAt,
  };
}

export function toDraft(result: ImportResult, serverRevision: number): AnalyzeResponse {
  const shot = result.screenshot;
  const primary = result.items[0];
  const tasks = result.items.flatMap((item) =>
    item.tasks.map((task) => taskInfo(task, false)).filter((task): task is TaskInfo => task !== null),
  );
  const categoryFromReading =
    readingCategory(shot.draftCategory) ?? readingCategory(shot.category) ?? (primary ? readingCategory(primary.category) : null);
  const item: ItemDraft = {
    title: generatedTitle(shot, result.items),
    category: categoryFromReading ?? "other",
    summary: primary?.summary || shot.summary || "",
    event: primary ? eventInfo(primary) : null,
    tasks,
  };
  return {
    draft_id: shot.id,
    image_url: shot.imageUrl,
    extracted_text: shot.ocrText,
    item,
    processing_status: shot.processingStatus,
    extraction_error: shot.extractionError,
    filename: shot.filename,
    server_revision: serverRevision,
    qr_codes: shot.qrCodes,
    qr_note: shot.qrNote,
    category_known: categoryFromReading !== null,
  };
}

export function toSaved(result: ImportResult): SavedItem[] {
  const shot = result.screenshot;
  if (!result.items.length) {
    const title = generatedTitle(shot, []) || shot.displayTitle.trim() || shot.draftTitle.trim() || "Untitled screenshot";
    return [
      {
        id: `shot-${shot.id}`,
        image_url: shot.imageUrl,
        created_at: shot.createdAt,
        confirmed: true,
        screenshot_id: shot.id,
        extracted_text: shot.ocrText,
        qr_codes: shot.qrCodes,
        qr_note: shot.qrNote,
        title,
        category: toContractCategory(shot.category || shot.draftCategory),
        summary: shot.summary,
        event: null,
        tasks: [],
      },
    ];
  }
  return result.items
    .filter((item) => item.reviewStatus === "confirmed")
    .map((item) => ({
      id: item.id,
      image_url: shot.imageUrl,
      created_at: shot.createdAt,
      confirmed: true,
      screenshot_id: shot.id,
      extracted_text: shot.ocrText,
      qr_codes: shot.qrCodes,
      qr_note: shot.qrNote,
      title: item.title.trim() && item.title.trim() !== shot.filename.trim() ? item.title : generatedTitle(shot, [item]) || item.title || "Untitled screenshot",
      category: toContractCategory(item.category),
      summary: item.summary,
      event: eventInfo(item),
      tasks: item.tasks.map((task) => taskInfo(task, true)).filter((task): task is TaskInfo => task !== null),
    }));
}

export function chosenTasks(tasks: TaskInfo[], withTasks: boolean): TaskInfo[] {
  if (!withTasks) {
    return [];
  }
  return tasks.filter((task) => task.title.trim() && (task.kind !== "suggestion" || task.included));
}
