import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";

import {
  approveScreenshot,
  deleteScreenshot,
  getDashboard,
  getGallery,
  getHealth,
  getScreenshotDetail,
  getTasks,
  imageUrl,
  interpretScreenshot,
  messageOf,
  PixieApiError,
  reanalyze,
  setTaskCompleted,
  uploadScreenshot,
} from "./src/api";
import { GoogleCalendarExport } from "./src/GoogleCalendarExport";
import { TaskCalendar } from "./src/TaskCalendar";
import {
  CATEGORIES,
  type Category,
  type Dashboard,
  type GalleryImage,
  type Health,
  type Review,
  type SavedItem,
  type SavedTask,
} from "./src/types";

type SimilarityChoice = "keep" | "delete-new" | "delete-old";

type SimilarSide = {
  id: string;
  filename: string;
  title: string;
  imageUrl: string;
};

type BatchProgress = {
  index: number;
  total: number;
  filename: string;
};

function sideLabel(title: string, filename: string): string {
  const name = title.trim();
  if (!name || name === "Untitled screenshot" || name === filename) {
    return filename;
  }
  return name;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FILTERS = ["All", ...CATEGORIES] as const;

const colors = {
  paper: "#f3eee4",
  card: "#fffdf8",
  ink: "#1e1a16",
  muted: "#6f675e",
  line: "#e2d8c8",
  green: "#0f6e56",
  greenSoft: "#e5f3ee",
  danger: "#8d3a32",
  dangerSoft: "#f8e8e4",
  notice: "#7a5b20",
  noticeSoft: "#f6edd8",
  white: "#ffffff",
};

const categoryTone: Record<Category, string> = {
  "Campus events": "#9a5b12",
  "Career Opportunities": "#0f6e56",
  Extracurriculars: "#1d4e89",
  Personal: "#7c3a6b",
  Other: "#6f675e",
};

function parseDate(value: string): string | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "invalid";
  }
  const [year, month, day] = trimmed.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return "invalid";
  }
  return trimmed;
}

function formatDeadline(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return value;
  }
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isSupportedImage(asset: DocumentPicker.DocumentPickerAsset): boolean {
  const mime = (asset.mimeType || "").toLowerCase();
  const name = asset.name.toLowerCase();
  if (
    mime === "image/png" ||
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/heic-sequence" ||
    mime === "image/heif-sequence"
  ) {
    return true;
  }
  if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return true;
  }
  return (
    (name.endsWith(".heic") || name.endsWith(".heif")) &&
    (mime === "" || mime === "application/octet-stream" || mime === "binary/octet-stream")
  );
}

function cardItems(items: SavedItem[]): SavedItem[] {
  const pending = items.filter((item) => item.reviewStatus === "needs_review");
  return pending.length ? pending : items;
}

function headingFrom(review: Review): { title: string; category: Category | null; summary: string } {
  const source = cardItems(review.items);
  const shot = review.screenshot;
  return {
    title: shot?.draftTitle || shot?.displayTitle || source[0]?.title || "",
    category: shot?.draftCategory || shot?.category || source[0]?.category || null,
    summary: source.find((item) => item.summary.trim())?.summary || shot?.summary || "",
  };
}

function whenLine(item: SavedItem): string {
  const parts: string[] = [];
  if (item.eventDate) {
    parts.push(formatDeadline(item.eventDate));
  } else if (item.dateText) {
    parts.push(item.dateText);
  }
  const clocks = [item.startTime, item.endTime].filter(Boolean).join("–");
  if (clocks) {
    parts.push(clocks);
  }
  if (item.location) {
    parts.push(item.location);
  }
  if (item.meetingUrl) {
    parts.push(item.meetingUrl);
  }
  return parts.join(" · ");
}

function sameText(left: string, right: string): boolean {
  return left.replace(/\s+/g, " ").trim().toLowerCase() === right.replace(/\s+/g, " ").trim().toLowerCase();
}

function calendarParts(value: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

function formatSchedule(item: SavedItem): string {
  const start = item.eventDate.trim();
  const end = item.endDate.trim();
  let dates = "";
  if (start && end && start !== end) {
    const left = calendarParts(start);
    const right = calendarParts(end);
    if (left && right && left.year === right.year && left.month === right.month) {
      const month = new Date(left.year, left.month - 1, left.day).toLocaleDateString(undefined, { month: "short" });
      dates = `${month} ${left.day}–${right.day}, ${left.year}`;
    } else if (left && right) {
      dates = `${formatDeadline(start)} – ${formatDeadline(end)}`;
    }
  } else if (start || end) {
    const single = start || end;
    dates = calendarParts(single) ? formatDeadline(single) : single;
  } else if (item.dateText.trim()) {
    dates = item.dateText.trim();
  }
  const clocks = [item.startTime.trim(), item.endTime.trim()].filter(Boolean).join("–");
  return [dates, clocks, item.timezone.trim()].filter(Boolean).join(" · ");
}

function prefixed(items: SavedItem[], cardTitle: string, item: SavedItem, value: string): string {
  const name = item.title.trim();
  if (items.length > 1 && name && !sameText(name, cardTitle)) {
    return `${name}: ${value}`;
  }
  return value;
}

function organizedDetails(summary: string, items: SavedItem[], ocrText: string): string[] {
  const lines: string[] = [];
  const add = (value: string) => {
    const text = value.trim();
    if (!text || lines.some((line) => sameText(line, text)) || (ocrText && sameText(text, ocrText))) {
      return;
    }
    lines.push(text);
  };
  add(summary);
  for (const item of items) {
    if (!sameText(item.summary, summary)) {
      add(item.summary);
    }
    if (item.registrationDeadline.trim()) {
      add(`Register by ${formatDeadline(item.registrationDeadline.trim())}`);
    }
    if (item.registrationRequired === true) {
      add(
        item.registrationUrl.trim()
          ? `Registration required · ${item.registrationUrl.trim()}`
          : "Registration required",
      );
    } else if (item.registrationRequired === false) {
      add("Registration is not required");
    } else if (item.registrationUrl.trim()) {
      add(item.registrationUrl.trim());
    }
    const link = item.meetingUrl.trim();
    if (link && !sameText(link, item.location)) {
      add(link);
    }
  }
  return lines;
}

function actionWhen(task: SavedItem["tasks"][number]): string {
  const parts = [task.deadline ? formatDeadline(task.deadline) : "", task.dueTime.trim()].filter(Boolean);
  return parts.length ? `due ${parts.join(" · ")}` : "";
}

function reviewNotes(review: Review, items: SavedItem[]): string[] {
  const notes: string[] = [];
  const add = (value: string) => {
    const text = value.trim();
    if (text && !notes.includes(text)) {
      notes.push(text);
    }
  };
  if (review.screenshot?.ambiguities) {
    add(review.screenshot.ambiguities);
  }
  for (const item of items) {
    for (const note of item.missing) {
      add(note);
    }
    for (const task of item.tasks) {
      if (task.dateAmbiguous && task.status !== "discarded") {
        add(`${task.title}: date needs confirmation`);
      }
    }
  }
  return notes;
}

function cardProblem(title: string, items: SavedItem[]): string | null {
  if (!title.trim()) {
    return "Add a short title.";
  }
  const time = /^(?:$|([01]\d|2[0-3]):[0-5]\d)$/;
  for (const item of items) {
    if (
      parseDate(item.eventDate) === "invalid" ||
      parseDate(item.endDate) === "invalid" ||
      parseDate(item.registrationDeadline) === "invalid"
    ) {
      return "Use YYYY-MM-DD, or leave a date blank.";
    }
    if (!time.test(item.startTime.trim()) || !time.test(item.endTime.trim())) {
      return "Use HH:MM for a time, or leave it blank.";
    }
  }
  return null;
}

function taskBucket(task: SavedTask): "soon" | "date" | "later" {
  if (task.dateAmbiguous && !task.deadline) {
    return "date";
  }
  if (task.deadline || (task.kind === "suggestion" && task.eventDate)) {
    return "soon";
  }
  return "later";
}

export default function App() {
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const localUriRef = useRef<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [tasks, setTasks] = useState<SavedTask[]>([]);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [review, setReview] = useState<Review | null>(null);
  const [batch, setBatch] = useState<Review[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [similarityPrompt, setSimilarityPrompt] = useState<{ newer: SimilarSide; older: SimilarSide } | null>(null);
  const batchRef = useRef<Review[]>([]);
  const removedIds = useRef(new Set<string>());
  const galleryEpoch = useRef(0);
  const similarityResolver = useRef<((choice: SimilarityChoice) => void) | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "analyzing" | "saving">("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<Record<string, boolean>>({});
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<Category | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [surface, setSurface] = useState<"home" | "calendar">("home");
  const [calendarRefresh, setCalendarRefresh] = useState(0);

  function startGalleryRead() {
    galleryEpoch.current += 1;
    return galleryEpoch.current;
  }

  function publishGallery(epoch: number, images: GalleryImage[]) {
    if (epoch === galleryEpoch.current) {
      setGallery(images);
    }
  }

  async function refreshLists() {
    const epoch = startGalleryRead();
    const [nextTasks, nextGallery, nextDashboard] = await Promise.all([
      getTasks(),
      getGallery(filter),
      getDashboard(),
    ]);
    setTasks(nextTasks);
    publishGallery(epoch, nextGallery);
    setDashboard(nextDashboard);
    setCalendarRefresh((current) => current + 1);
  }

  useEffect(() => {
    let cancelled = false;
    const epoch = startGalleryRead();
    async function load() {
      try {
        const [nextHealth, nextTasks, nextGallery, nextDashboard] = await Promise.all([
          getHealth(),
          getTasks(),
          getGallery("All"),
          getDashboard(),
        ]);
        if (!cancelled) {
          setHealth(nextHealth);
          setTasks(nextTasks);
          publishGallery(epoch, nextGallery);
          setDashboard(nextDashboard);
        }
      } catch (error) {
        if (!cancelled) {
          setBanner(messageOf(error));
        }
      } finally {
        if (!cancelled) {
          setLoadingTasks(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const reviewKey = review
    ? [
        review.screenshot?.id ?? "",
        review.screenshot?.draftTitle ?? "",
        review.screenshot?.displayTitle ?? "",
        review.screenshot?.processingStatus ?? "",
        review.items
          .map((item) => `${item.id}:${item.reviewStatus}:${item.tasks.map((task) => `${task.id}:${task.status}`).join(",")}`)
          .join("|"),
      ].join("~")
    : "";

  useEffect(() => {
    setTitleDraft(null);
    setCategoryDraft(null);
    setSummaryDraft(null);
    setEditing(false);
    if (!review) {
      setSelectedTasks({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const item of cardItems(review.items)) {
      for (const task of item.tasks) {
        if (task.status === "discarded") {
          continue;
        }
        next[task.id] = task.status === "accepted" || task.kind !== "suggestion";
      }
    }
    setSelectedTasks(next);
  }, [reviewKey]);

  useEffect(() => {
    const shotId = review?.screenshot?.id;
    if (!shotId || !review) {
      return;
    }
    setBatch((current) => {
      if (removedIds.current.has(shotId)) {
        const pruned = current.filter((item) => item.screenshot?.id !== shotId);
        batchRef.current = pruned;
        return pruned;
      }
      const index = current.findIndex((item) => item.screenshot?.id === shotId);
      if (index >= 0 && current[index] === review) {
        batchRef.current = current;
        return current;
      }
      const next = current.slice();
      if (index === -1) {
        next.push(review);
      } else {
        next[index] = review;
      }
      batchRef.current = next;
      return next;
    });
  }, [review]);

  useEffect(() => {
    let cancelled = false;
    const epoch = startGalleryRead();
    async function loadGallery() {
      try {
        const next = await getGallery(filter);
        if (!cancelled) {
          publishGallery(epoch, next);
        }
      } catch (error) {
        if (!cancelled) {
          setBanner(messageOf(error));
        }
      }
    }
    void loadGallery();
    return () => {
      cancelled = true;
    };
  }, [filter]);

  function replaceLocalUri(next: string | null) {
    const previous = localUriRef.current;
    if (previous && previous.startsWith("blob:") && previous !== next) {
      URL.revokeObjectURL(previous);
    }
    localUriRef.current = next;
  }

  function replaceItem(next: SavedItem) {
    setReview((current) => {
      if (!current) {
        return current;
      }
      const exists = current.items.some((item) => item.id === next.id);
      return {
        ...current,
        items: exists ? current.items.map((item) => (item.id === next.id ? next : item)) : [...current.items, next],
      };
    });
  }

  async function reloadHealth() {
    try {
      setHealth(await getHealth());
    } catch (error) {
      setBanner(messageOf(error));
    }
  }

  function forgetScreenshot(id: string) {
    removedIds.current.add(id);
    const next = batchRef.current.filter((item) => item.screenshot?.id !== id);
    batchRef.current = next;
    setBatch(next);
    setReview((shown) => (shown?.screenshot?.id === id ? next[next.length - 1] ?? null : shown));
  }

  function askSimilarity(newer: SimilarSide, older: SimilarSide): Promise<SimilarityChoice> {
    return new Promise((resolve) => {
      similarityResolver.current = resolve;
      setSimilarityPrompt({ newer, older });
    });
  }

  function chooseSimilarity(choice: SimilarityChoice) {
    const resolve = similarityResolver.current;
    similarityResolver.current = null;
    setSimilarityPrompt(null);
    resolve?.(choice);
  }

  async function chooseScreenshot() {
    if (phase !== "idle") {
      return;
    }
    setBanner(null);
    setAnalysisError(null);
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ["image/png", "image/jpeg", "image/heic", "image/heif", ".heic", ".heif"],
        multiple: true,
        copyToCacheDirectory: true,
        base64: false,
      });
    } catch {
      setBanner("The file picker could not open. Try choosing the screenshot again.");
      return;
    }
    if (result.canceled || !result.assets?.length) {
      return;
    }
    const accepted: DocumentPicker.DocumentPickerAsset[] = [];
    const problems: string[] = [];
    for (const asset of result.assets) {
      if (!isSupportedImage(asset)) {
        problems.push(`${asset.name}: choose a PNG, JPEG, or HEIC screenshot.`);
        continue;
      }
      if (asset.size && asset.size > MAX_IMAGE_BYTES) {
        problems.push(`${asset.name} is larger than 8 MB.`);
        continue;
      }
      if (!asset.file) {
        problems.push(`${asset.name}: this browser did not provide the file.`);
        continue;
      }
      accepted.push(asset);
    }
    if (!accepted.length) {
      setBanner(problems.join(" ") || "Choose a PNG, JPEG, or HEIC screenshot.");
      return;
    }

    async function settleSimilar(
      newer: SimilarSide,
      matches: Array<{ id: string; filename: string; title: string; imageUrl: string }>,
    ): Promise<boolean> {
      for (const match of matches) {
        if (!match.id || match.id === newer.id) {
          continue;
        }
        const choice = await askSimilarity(newer, {
          id: match.id,
          filename: match.filename,
          title: match.title || match.filename,
          imageUrl: match.imageUrl,
        });
        if (choice === "keep") {
          continue;
        }
        const targetId = choice === "delete-new" ? newer.id : match.id;
        const label = choice === "delete-new" ? newer.filename : match.filename;
        try {
          await deleteScreenshot(targetId);
        } catch (error) {
          const message = `${label}: ${messageOf(error)}`;
          problems.push(message);
          setBanner(message);
          continue;
        }
        forgetScreenshot(targetId);
        galleryEpoch.current += 1;
        setGallery((current) => current.filter((image) => image.id !== targetId));
        try {
          await refreshLists();
        } catch (error) {
          setBanner(messageOf(error));
        }
        if (choice === "delete-new") {
          return true;
        }
      }
      return false;
    }

    const total = accepted.length;
    for (let index = 0; index < accepted.length; index += 1) {
      const asset = accepted[index];
      const file = asset.file;
      if (!file) {
        continue;
      }
      setBatchProgress({ index: index + 1, total, filename: asset.name });
      replaceLocalUri(asset.uri);
      setShowText(false);
      setAnalysisError(null);
      setReview({ localUri: asset.uri, screenshot: null, items: [], notice: null, mode: "import" });
      setPhase("reading");
      try {
        const uploaded = await uploadScreenshot(file);
        setReview({
          localUri: asset.uri,
          screenshot: uploaded.screenshot,
          items: [],
          notice: null,
          mode: "import",
        });
        const droppedNew = await settleSimilar(
          {
            id: uploaded.screenshot.id,
            filename: uploaded.screenshot.filename || asset.name,
            title: uploaded.screenshot.draftTitle || uploaded.screenshot.displayTitle || asset.name,
            imageUrl: uploaded.screenshot.imageUrl,
          },
          uploaded.similar,
        );
        if (droppedNew) {
          continue;
        }
        const readStatus = uploaded.screenshot.processingStatus;
        if (readStatus === "ocr_failed" || readStatus === "no_text") {
          const message = uploaded.screenshot.extractionError || "Pixie could not read this screenshot.";
          setAnalysisError(message);
          problems.push(`${asset.name}: ${message}`);
          continue;
        }
        setPhase("analyzing");
        const interpreted = await interpretScreenshot(uploaded.screenshot.id);
        const analyzed = interpreted.screenshot.processingStatus;
        if (analyzed === "ready") {
          setAnalysisError(null);
          setReview({
            localUri: asset.uri,
            screenshot: interpreted.screenshot,
            items: interpreted.items,
            notice: interpreted.notice,
            mode: "import",
          });
        } else {
          const message =
            interpreted.screenshot.extractionError ||
            "Interpretation failed. The screenshot is saved. Retry the analysis or enter the details yourself.";
          setAnalysisError(message);
          problems.push(`${asset.name}: ${message}`);
          setReview({
            localUri: asset.uri,
            screenshot: interpreted.screenshot,
            items: [],
            notice: null,
            mode: "import",
          });
        }
      } catch (error) {
        const failed = error instanceof PixieApiError ? error.screenshot ?? null : null;
        const failedItems = error instanceof PixieApiError ? error.items ?? [] : [];
        const matches = error instanceof PixieApiError ? error.similar : [];
        if (failed) {
          setReview({
            localUri: asset.uri,
            screenshot: failed,
            items: failedItems,
            notice: null,
            mode: "import",
          });
          if (matches.length) {
            const droppedNew = await settleSimilar(
              {
                id: failed.id,
                filename: failed.filename || asset.name,
                title: failed.draftTitle || failed.displayTitle || asset.name,
                imageUrl: failed.imageUrl,
              },
              matches,
            );
            if (droppedNew) {
              continue;
            }
          }
        }
        const message = messageOf(error);
        problems.push(`${asset.name}: ${message}`);
        setReview((current) => ({
          localUri: asset.uri,
          screenshot: failed ?? current?.screenshot ?? null,
          items: failedItems.length ? failedItems : current?.items ?? [],
          notice: null,
          mode: "import",
        }));
        setAnalysisError(message);
        if (failed) {
          try {
            await refreshLists();
          } catch {
            // The import error is already shown.
          }
        }
      }
    }
    setBatchProgress(null);
    setPhase("idle");
    if (problems.length) {
      setBanner(problems.join(" "));
    }
    try {
      await refreshLists();
    } catch (error) {
      setBanner(messageOf(error));
    }
  }

  function updateItem(itemId: string, patch: Partial<SavedItem>) {
    setReview((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        items: current.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
      };
    });
  }

  async function approve(withTasks: boolean) {
    if (!review?.screenshot || phase !== "idle") {
      return;
    }
    const server = headingFrom(review);
    const title = (titleDraft ?? server.title).trim();
    const category = categoryDraft ?? server.category;
    if (!category) {
      setBanner("Choose a category.");
      return;
    }
    const summary = (summaryDraft ?? server.summary).trim();
    const source = cardItems(review.items);
    const problem = cardProblem(title, source);
    if (problem) {
      setBanner(problem);
      return;
    }
    const taskIds = withTasks
      ? source.flatMap((item) =>
          item.tasks.filter((task) => task.status !== "discarded" && selectedTasks[task.id]).map((task) => task.id),
        )
      : [];
    setPhase("saving");
    setBanner(null);
    try {
      const saved = await approveScreenshot(review.screenshot.id, {
        title,
        category,
        summary: summary || null,
        taskIds,
        tasks: source.flatMap((item) =>
          item.tasks
            .filter((task) => taskIds.includes(task.id))
            .map((task) => ({ id: task.id, title: task.title.trim() })),
        ),
        items: source.map((item) => ({
          id: item.id,
          title: source.length === 1 ? title : item.title,
          eventDate: item.eventDate,
          endDate: item.endDate,
          startTime: item.startTime,
          endTime: item.endTime,
          location: item.location,
          meetingUrl: item.meetingUrl,
        })),
      });
      setReview((current) =>
        current
          ? { ...current, screenshot: saved.screenshot, items: saved.items, notice: saved.notice }
          : current,
      );
      setEditing(false);
      await refreshLists();
    } catch (error) {
      setBanner(messageOf(error));
    } finally {
      setPhase("idle");
    }
  }

  async function readAgain() {
    if (!review?.screenshot || phase !== "idle") {
      return;
    }
    setShowText(false);
    setAnalysisError(null);
    setPhase("reading");
    setBanner(null);
    try {
      const reread = await reanalyze(review.screenshot.id);
      setReview((current) => (current ? { ...current, screenshot: reread.screenshot } : current));
      setPhase("analyzing");
      const imported = await interpretScreenshot(review.screenshot.id);
      setAnalysisError(null);
      setReview((current) =>
        current
          ? { ...current, screenshot: imported.screenshot, items: imported.items, notice: imported.notice }
          : current,
      );
      await refreshLists();
    } catch (error) {
      const message = messageOf(error);
      setAnalysisError(message);
      setBanner(message);
      if (error instanceof PixieApiError && error.screenshot) {
        setReview((current) =>
          current
            ? {
                ...current,
                screenshot: error.screenshot ?? current.screenshot,
                items: error.items ?? current.items,
              }
            : current,
        );
      }
    } finally {
      setPhase("idle");
    }
  }

  async function toggleTask(task: SavedTask) {
    if (updatingId) {
      return;
    }
    const next = !task.completed;
    setUpdatingId(task.id);
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, completed: next } : item)));
    try {
      const updated = await setTaskCompleted(task.id, next);
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
      setDashboard(await getDashboard());
      setCalendarRefresh((current) => current + 1);
    } catch (error) {
      setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));
      setBanner(messageOf(error));
    } finally {
      setUpdatingId(null);
    }
  }

  async function openSource(screenshotId: string) {
    setBanner(null);
    setAnalysisError(null);
    setShowText(false);
    let continueAnalysis = false;
    try {
      const detail = await getScreenshotDetail(screenshotId);
      replaceLocalUri(null);
      if (detail.screenshot.processingStatus === "ocr_complete") {
        continueAnalysis = true;
        setPhase("analyzing");
        setReview({
          localUri: null,
          screenshot: detail.screenshot,
          items: [],
          notice: null,
          mode: "source",
        });
        const interpreted = await interpretScreenshot(screenshotId);
        if (interpreted.screenshot.processingStatus === "ready") {
          setAnalysisError(null);
          setReview({
            localUri: null,
            screenshot: interpreted.screenshot,
            items: interpreted.items,
            notice: interpreted.notice,
            mode: "source",
          });
        } else {
          setAnalysisError(
            interpreted.screenshot.extractionError ||
              "Interpretation failed. The screenshot is saved. Retry the analysis or enter the details yourself.",
          );
          setReview({
            localUri: null,
            screenshot: interpreted.screenshot,
            items: [],
            notice: null,
            mode: "source",
          });
        }
      } else {
        setReview({
          localUri: null,
          screenshot: detail.screenshot,
          items: detail.items,
          notice: null,
          mode: "source",
        });
      }
    } catch (error) {
      const message = messageOf(error);
      setBanner(message);
      if (error instanceof PixieApiError && error.screenshot) {
        setAnalysisError(message);
        setReview((current) =>
          current
            ? {
                ...current,
                screenshot: error.screenshot ?? current.screenshot,
                items: error.items ?? [],
              }
            : current,
        );
      }
    } finally {
      if (continueAnalysis) {
        setPhase("idle");
      }
    }
  }

  const grouped = useMemo(() => {
    const sortTasks = (rows: SavedTask[]) =>
      [...rows].sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        const aWhen = a.deadline || a.eventDate || "";
        const bWhen = b.deadline || b.eventDate || "";
        if (aWhen !== bWhen) {
          return aWhen.localeCompare(bWhen);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
    return [
      { key: "soon", title: "Time-sensitive", tasks: sortTasks(tasks.filter((task) => taskBucket(task) === "soon")) },
      { key: "date", title: "Needs a date", tasks: sortTasks(tasks.filter((task) => taskBucket(task) === "date")) },
      { key: "later", title: "Do later", tasks: sortTasks(tasks.filter((task) => taskBucket(task) === "later")) },
    ].filter((group) => group.tasks.length > 0);
  }, [tasks]);

  const preview =
    (review?.screenshot?.imageUrl ? imageUrl(review.screenshot.imageUrl) : null) || review?.localUri || null;
  const fileProgress =
    batchProgress && batchProgress.total > 1
      ? ` · ${batchProgress.filename} (${batchProgress.index} of ${batchProgress.total})`
      : "";
  const readingLabel = `Reading image${fileProgress}`;
  const analyzingLabel = `Analyzing with local AI${fileProgress}`;
  const analyzingLong = `Analyzing with local AI${fileProgress}. This stays on your laptop and can take a minute.`;
  const serverCard = review ? headingFrom(review) : null;
  const cardTitle = titleDraft ?? serverCard?.title ?? "";
  const cardCategory = categoryDraft ?? serverCard?.category ?? null;
  const cardSummary = summaryDraft ?? serverCard?.summary ?? "";
  const sourceItems = review ? cardItems(review.items) : [];
  const interpretationFailed = Boolean(
    analysisError ||
      review?.screenshot?.processingStatus === "model_failed" ||
      review?.screenshot?.processingStatus === "no_text" ||
      review?.screenshot?.processingStatus === "ocr_failed",
  );
  const busy = phase === "reading" || phase === "analyzing";
  const notes = review && !interpretationFailed ? reviewNotes(review, sourceItems) : [];
  const actions = sourceItems.flatMap((item) => item.tasks.filter((task) => task.status !== "discarded"));
  const awaitingModel = review?.screenshot?.processingStatus === "ocr_complete" && !interpretationFailed;
  const timeLines = sourceItems
    .map((item) => {
      const when = formatSchedule(item);
      return when ? prefixed(sourceItems, cardTitle, item, when) : "";
    })
    .filter((line, index, all) => Boolean(line) && all.indexOf(line) === index);
  const placeLines = sourceItems
    .map((item) => {
      const place = item.location.trim();
      return place ? prefixed(sourceItems, cardTitle, item, place) : "";
    })
    .filter((line, index, all) => Boolean(line) && all.indexOf(line) === index);
  const detailLines = organizedDetails(cardSummary, sourceItems, review?.screenshot?.ocrText ?? "").filter(
    (line) => !sameText(line, cardTitle) && !placeLines.some((place) => sameText(place, line)),
  );
  const healthText = health
    ? [health.ollama.ok ? "" : health.ollama.message, health.tesseract.ok ? "" : health.tesseract.message]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <View style={styles.page}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.mark}>Pixie</Text>
          <Text style={styles.tagline}>a little magic for your camera roll</Text>
          <Text style={styles.intro}>
            Turn screenshots into titled cards. Approve each one before any task is added. Reading and saving stay on this laptop.
          </Text>
          <View style={styles.chips}>
            {(
              [
                ["home", "Home"],
                ["calendar", "Calendar"],
              ] as const
            ).map(([value, label]) => {
              const selected = surface === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setSurface(value)}
                  style={[styles.chip, selected && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {health && !health.ok ? (
          <View style={[styles.banner, styles.warningBanner]}>
            <Text style={styles.warningText}>{healthText}</Text>
            <Pressable onPress={() => void reloadHealth()} accessibilityRole="button">
              <Text style={styles.link}>Check again</Text>
            </Pressable>
          </View>
        ) : null}

        {banner ? (
          <View style={[styles.banner, styles.errorBanner]}>
            <Text style={styles.errorText}>{banner}</Text>
          </View>
        ) : null}

        {surface === "calendar" ? (
          <TaskCalendar
            todayHint={dashboard?.todayDate ?? ""}
            refreshToken={calendarRefresh}
            onTasksChanged={() => {
              void refreshLists();
            }}
            onOpenSource={(screenshotId) => {
              setSurface("home");
              void openSource(screenshotId);
            }}
          />
        ) : null}

        {surface === "home" && dashboard ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Today and upcoming</Text>
            <Text style={styles.hint}>
              {dashboard.todayDate} in {dashboard.timezone}. {dashboard.needsReview}{" "}
              {dashboard.needsReview === 1 ? "item still needs review." : "items still need review."}
            </Text>
            <DashboardBlock title="Today" lines={[...dashboard.todayEvents, ...dashboard.todayTasks]} />
            <DashboardBlock title="Overdue" lines={dashboard.overdueTasks} />
            <DashboardBlock title="Upcoming" lines={[...dashboard.upcomingEvents, ...dashboard.upcomingTasks]} />
          </View>
        ) : null}

        {surface === "home" ? (
        <View style={[styles.columns, wide && styles.columnsWide]}>
          <View style={styles.column}>
            <View style={styles.card}>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                  phase !== "idle" && styles.disabled,
                ]}
                onPress={() => void chooseScreenshot()}
                disabled={phase !== "idle"}
                accessibilityRole="button"
                accessibilityLabel="Choose screenshots"
              >
                <Text style={styles.primaryLabel}>Choose screenshots</Text>
              </Pressable>
              <Text style={styles.hint}>PNG, JPEG, or HEIC, up to 8 MB each. You can choose more than one.</Text>
              {busy ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.green} />
                  <Text style={styles.loadingText}>
                    {similarityPrompt
                      ? "Waiting for you to compare two similar images."
                      : phase === "reading"
                        ? readingLabel
                        : analyzingLong}
                  </Text>
                </View>
              ) : null}
            </View>

            {batch.length > 1 ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Screenshots to review</Text>
                <Text style={styles.hint}>Open one to see its title, time, location, and actions.</Text>
                <View style={styles.chips}>
                  {batch.map((item, index) => {
                    const id = item.screenshot?.id ?? String(index);
                    const selected = id === review?.screenshot?.id;
                    const label =
                      item.screenshot?.draftTitle ||
                      item.screenshot?.displayTitle ||
                      item.screenshot?.filename ||
                      `Image ${index + 1}`;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => {
                          if (phase !== "idle") {
                            return;
                          }
                          setAnalysisError(null);
                          setShowText(false);
                          setReview(item);
                        }}
                        disabled={phase !== "idle"}
                        style={[styles.chip, selected && styles.chipOn, phase !== "idle" && styles.disabled]}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: phase !== "idle" }}
                        accessibilityLabel={`Review ${label}`}
                      >
                        <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]} numberOfLines={1}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {review && preview ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  {busy
                    ? phase === "reading"
                      ? readingLabel
                      : analyzingLabel
                    : interpretationFailed
                      ? "Could not interpret this screenshot"
                      : awaitingModel
                        ? "Analyzing with local AI"
                        : cardTitle || "Ready for review"}
                </Text>
                {!busy && !interpretationFailed && !awaitingModel ? <Text style={styles.hint}>Ready for review</Text> : null}
                <Image source={{ uri: preview }} style={styles.preview} resizeMode="contain" accessibilityLabel="Selected screenshot" />
                {review.notice ? (
                  <View style={[styles.banner, styles.noticeBanner]}>
                    <Text style={styles.noticeText}>{review.notice}</Text>
                  </View>
                ) : null}
                {review.screenshot ? (
                  <View style={styles.row}>
                    <Pressable
                      onPress={() => void readAgain()}
                      disabled={phase !== "idle"}
                      accessibilityRole="button"
                    >
                      <Text style={styles.link}>
                        {phase === "reading" ? readingLabel : phase === "analyzing" ? analyzingLabel : "Retry analysis"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {busy ? null : interpretationFailed ? (
                  <View style={styles.suggestion}>
                    <Text style={styles.fieldError}>
                      {analysisError ||
                        review.screenshot?.extractionError ||
                        "Interpretation failed. The screenshot is saved. Retry the analysis or enter the details yourself."}
                    </Text>
                    <View style={styles.row}>
                      <Pressable onPress={() => void readAgain()} disabled={phase !== "idle"} accessibilityRole="button">
                        <Text style={styles.link}>Retry analysis</Text>
                      </Pressable>
                      <Pressable onPress={() => setEditing(true)} disabled={phase !== "idle"} accessibilityRole="button">
                        <Text style={styles.link}>Edit manually</Text>
                      </Pressable>
                    </View>
                    {editing ? (
                      <View style={{ gap: 8 }}>
                        <Text style={styles.label}>Title</Text>
                        <TextInput
                          value={cardTitle}
                          onChangeText={setTitleDraft}
                          style={styles.input}
                          placeholder="A short name for this screenshot"
                          placeholderTextColor={colors.muted}
                          maxLength={80}
                        />
                        <Text style={styles.label}>Category</Text>
                        <View style={styles.chips}>
                          {CATEGORIES.map((category) => {
                            const selected = cardCategory === category;
                            return (
                              <Pressable
                                key={category}
                                onPress={() => setCategoryDraft(category)}
                                style={[
                                  styles.chip,
                                  selected && { backgroundColor: categoryTone[category], borderColor: categoryTone[category] },
                                ]}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                              >
                                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{category}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <Pressable
                          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, phase !== "idle" && styles.disabled]}
                          onPress={() => void approve(false)}
                          disabled={phase !== "idle"}
                          accessibilityRole="button"
                        >
                          <Text style={styles.secondaryLabel}>{phase === "saving" ? "Saving…" : "Save without tasks"}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : awaitingModel ? (
                  <View style={styles.suggestion}>
                    <Text style={styles.body}>This image was read. The local analysis has not finished.</Text>
                    <Pressable onPress={() => void readAgain()} disabled={phase !== "idle"} accessibilityRole="button">
                      <Text style={styles.link}>Retry analysis</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.suggestion}>
                    {cardTitle || timeLines.length || placeLines.length || detailLines.length || actions.length ? (
                      <View style={styles.analysis}>
                        {cardTitle ? (
                          <View style={styles.analysisRow}>
                            <Text style={styles.analysisLabel}>Title</Text>
                            <Text style={styles.analysisValue}>{cardTitle}</Text>
                          </View>
                        ) : null}
                        {timeLines.length ? (
                          <View style={styles.analysisRow}>
                            <Text style={styles.analysisLabel}>Time</Text>
                            {timeLines.map((line) => (
                              <Text key={line} style={styles.analysisValue}>
                                {line}
                              </Text>
                            ))}
                          </View>
                        ) : null}
                        {placeLines.length ? (
                          <View style={styles.analysisRow}>
                            <Text style={styles.analysisLabel}>Location</Text>
                            {placeLines.map((line) => (
                              <Text key={line} style={styles.analysisValue}>
                                {line}
                              </Text>
                            ))}
                          </View>
                        ) : null}
                        {detailLines.length ? (
                          <View style={styles.analysisRow}>
                            <Text style={styles.analysisLabel}>Details</Text>
                            {detailLines.map((line) => (
                              <Text key={line} style={styles.analysisValue}>
                                {line}
                              </Text>
                            ))}
                          </View>
                        ) : null}
                        {actions.length ? (
                          <View style={styles.analysisRow}>
                            <Text style={styles.analysisLabel}>Actions</Text>
                            {actions.map((task) => {
                              const checked = Boolean(selectedTasks[task.id]);
                              const added = task.status === "accepted";
                              const when = actionWhen(task);
                              return (
                                <View key={task.id} style={styles.task}>
                                  <Pressable
                                    onPress={() => {
                                      if (!added) {
                                        setSelectedTasks((current) => ({ ...current, [task.id]: !current[task.id] }));
                                      }
                                    }}
                                    disabled={added || phase !== "idle"}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked, disabled: added }}
                                    style={[styles.check, checked && styles.checkOn]}
                                  >
                                    <Text style={styles.checkLabel}>{checked ? "✓" : ""}</Text>
                                  </Pressable>
                                  <View style={styles.taskBody}>
                                    {editing && !added ? (
                                      <TextInput
                                        value={task.title}
                                        onChangeText={(title) =>
                                          setReview((current) =>
                                            current
                                              ? {
                                                  ...current,
                                                  items: current.items.map((entry) => ({
                                                    ...entry,
                                                    tasks: entry.tasks.map((candidate) =>
                                                      candidate.id === task.id ? { ...candidate, title } : candidate,
                                                    ),
                                                  })),
                                                }
                                              : current,
                                          )
                                        }
                                        style={styles.input}
                                        maxLength={200}
                                      />
                                    ) : (
                                      <Text style={styles.taskTitle}>{task.title}</Text>
                                    )}
                                    <Text style={styles.taskMeta}>
                                      {added ? "Added" : task.kind === "suggestion" ? "Suggestion" : "From the screenshot"}
                                      {when ? ` · ${when}` : ""}
                                      {task.dateAmbiguous ? " · date needs confirmation" : ""}
                                    </Text>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    <Text style={styles.label}>Category</Text>
                    {cardCategory ? (
                      <Text style={[styles.hint, { color: categoryTone[cardCategory] }]}>{cardCategory}</Text>
                    ) : (
                      <Text style={styles.hint}>Choose one category.</Text>
                    )}
                    {editing ? (
                      <View style={{ gap: 8 }}>
                        <Text style={styles.label}>Title</Text>
                        <TextInput value={cardTitle} onChangeText={setTitleDraft} style={styles.input} maxLength={80} />
                        <Text style={styles.label}>Summary</Text>
                        <TextInput
                          value={cardSummary}
                          onChangeText={setSummaryDraft}
                          style={styles.input}
                          placeholder="Optional"
                          placeholderTextColor={colors.muted}
                          maxLength={180}
                        />
                      </View>
                    ) : null}
                    <View style={styles.chips}>
                      {CATEGORIES.map((category) => {
                        const selected = cardCategory === category;
                        return (
                          <Pressable
                            key={category}
                            onPress={() => setCategoryDraft(category)}
                            style={[
                              styles.chip,
                              selected && { backgroundColor: categoryTone[category], borderColor: categoryTone[category] },
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                          >
                            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{category}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {sourceItems.map((item) => {
                      const when = whenLine(item);
                      const showLineTitle = sourceItems.length > 1 && item.title.trim() && item.title.trim() !== cardTitle.trim();
                      if (
                        !editing &&
                        !when &&
                        !item.registrationDeadline &&
                        !showLineTitle &&
                        item.reviewStatus !== "confirmed"
                      ) {
                        return null;
                      }
                      return (
                        <View key={item.id} style={{ gap: 8 }}>
                          {showLineTitle ? <Text style={styles.taskTitle}>{item.title}</Text> : null}
                          {editing && sourceItems.length > 1 ? (
                            <TextInput
                              value={item.title}
                              onChangeText={(title) => updateItem(item.id, { title })}
                              style={styles.input}
                              maxLength={80}
                            />
                          ) : null}
                          {editing ? (
                            <View style={{ gap: 8 }}>
                              <Text style={styles.label}>Time</Text>
                              <TextInput
                                value={item.eventDate}
                                onChangeText={(eventDate) => updateItem(item.id, { eventDate })}
                                style={styles.input}
                                placeholder={item.dateText || "Start date YYYY-MM-DD"}
                                placeholderTextColor={colors.muted}
                                autoCapitalize="none"
                                maxLength={10}
                              />
                              <TextInput
                                value={item.endDate}
                                onChangeText={(endDate) => updateItem(item.id, { endDate })}
                                style={styles.input}
                                placeholder="End date YYYY-MM-DD"
                                placeholderTextColor={colors.muted}
                                autoCapitalize="none"
                                maxLength={10}
                              />
                              <View style={styles.row}>
                                <TextInput
                                  value={item.startTime}
                                  onChangeText={(startTime) => updateItem(item.id, { startTime })}
                                  style={[styles.input, { flex: 1 }]}
                                  placeholder="Start HH:MM"
                                  placeholderTextColor={colors.muted}
                                  autoCapitalize="none"
                                  maxLength={5}
                                />
                                <TextInput
                                  value={item.endTime}
                                  onChangeText={(endTime) => updateItem(item.id, { endTime })}
                                  style={[styles.input, { flex: 1 }]}
                                  placeholder="End HH:MM"
                                  placeholderTextColor={colors.muted}
                                  autoCapitalize="none"
                                  maxLength={5}
                                />
                              </View>
                              <Text style={styles.label}>Location</Text>
                              <TextInput
                                value={item.location}
                                onChangeText={(location) => updateItem(item.id, { location })}
                                style={styles.input}
                                placeholder="Location"
                                placeholderTextColor={colors.muted}
                                maxLength={300}
                              />
                              <TextInput
                                value={item.meetingUrl}
                                onChangeText={(meetingUrl) => updateItem(item.id, { meetingUrl })}
                                style={styles.input}
                                placeholder="Meeting URL"
                                placeholderTextColor={colors.muted}
                                autoCapitalize="none"
                              />
                            </View>
                          ) : null}
                          <GoogleCalendarExport
                            item={item}
                            disabled={phase !== "idle"}
                            onEdit={() => setEditing(true)}
                          />
                        </View>
                      );
                    })}
                    {notes.length ? <Text style={styles.noticeText}>{notes.join(" · ")}</Text> : null}
                    <View style={styles.row}>
                      <Pressable onPress={() => setEditing((current) => !current)} disabled={phase !== "idle"} accessibilityRole="button">
                        <Text style={styles.link}>{editing ? "Hide extra fields" : "Edit details"}</Text>
                      </Pressable>
                      <Pressable onPress={() => void readAgain()} disabled={phase !== "idle"} accessibilityRole="button">
                        <Text style={styles.link}>Retry analysis</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, phase !== "idle" && styles.disabled]}
                        onPress={() => void approve(true)}
                        disabled={phase !== "idle" || actions.length === 0}
                        accessibilityRole="button"
                      >
                        <Text style={styles.primaryLabel}>
                          {phase === "saving" ? "Saving…" : "Approve and add selected tasks"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, phase !== "idle" && styles.disabled]}
                        onPress={() => void approve(false)}
                        disabled={phase !== "idle"}
                        accessibilityRole="button"
                      >
                        <Text style={styles.secondaryLabel}>{phase === "saving" ? "Saving…" : "Save without tasks"}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                {busy ? null : (
                  <>
                    <Pressable onPress={() => setShowText((current) => !current)} accessibilityRole="button">
                      <Text style={styles.link}>{showText ? "Hide extracted text" : "View extracted text"}</Text>
                    </Pressable>
                    {showText ? (
                      <ScrollView style={styles.ocrScroll} nestedScrollEnabled>
                        <Text selectable style={styles.ocrText}>
                          {review.screenshot?.ocrText || "No readable text was found."}
                        </Text>
                      </ScrollView>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}
          </View>

          <View style={styles.column}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Gallery</Text>
              <View style={styles.chips}>
                {FILTERS.map((category) => {
                  const selected = filter === category;
                  return (
                    <Pressable
                      key={category}
                      onPress={() => setFilter(category)}
                      style={[styles.chip, selected && styles.chipOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{category}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {gallery.length === 0 ? <Text style={styles.body}>No saved images in this filter.</Text> : null}
              {gallery.map((image) => (
                <Pressable key={image.id} onPress={() => void openSource(image.id)} accessibilityRole="button" style={styles.task}>
                  <Image source={{ uri: imageUrl(image.imageUrl) }} style={styles.thumb} resizeMode="cover" />
                  <View style={styles.taskBody}>
                    <Text style={styles.taskTitle}>{image.title}</Text>
                    <Text style={styles.taskMeta}>
                      {image.categories.length ? image.categories.join(", ") : "Unclassified"}
                      {image.needsReview ? " · needs review" : ""}
                      {image.itemCount ? ` · ${image.itemCount} item${image.itemCount === 1 ? "" : "s"}` : ""}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.rowSpread}>
                <Text style={styles.sectionTitle}>Accepted tasks</Text>
                <Pressable onPress={() => void refreshLists()} disabled={loadingTasks} accessibilityRole="button">
                  <Text style={styles.link}>Refresh</Text>
                </Pressable>
              </View>
              {loadingTasks ? <Text style={styles.hint}>Loading saved tasks…</Text> : null}
              {!loadingTasks && tasks.length === 0 ? (
                <Text style={styles.body}>Accepted tasks will stay here after you reload.</Text>
              ) : null}
              {grouped.map((group) => (
                <View key={group.key} style={styles.group}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  {group.tasks.map((task) => (
                    <View key={task.id} style={styles.task}>
                      <Pressable onPress={() => void openSource(task.screenshotId)} accessibilityRole="button" accessibilityLabel={`View source screenshot ${task.sourceTitle}`}>
                        <Image source={{ uri: imageUrl(task.imageUrl) }} style={styles.thumb} resizeMode="cover" />
                      </Pressable>
                      <View style={styles.taskBody}>
                        <Text style={[styles.taskTitle, task.completed && styles.completedTitle]}>{task.title}</Text>
                        {task.details ? <Text style={styles.taskMeta}>{task.details}</Text> : null}
                        <Text style={styles.taskMeta}>
                          {task.deadline
                            ? `Due ${formatDeadline(task.deadline)}`
                            : task.dateAmbiguous
                              ? "Date needs confirmation"
                              : task.kind === "suggestion" && task.eventDate
                                ? `Event ${formatDeadline(task.eventDate)}`
                                : "No deadline"}
                          {` · ${task.sourceTitle}`}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => void toggleTask(task)}
                        disabled={updatingId === task.id}
                        accessibilityRole="checkbox"
                        accessibilityLabel={task.completed ? "Mark not done" : "Mark done"}
                        accessibilityState={{ checked: task.completed, disabled: updatingId === task.id }}
                        style={[styles.check, task.completed && styles.checkOn]}
                      >
                        <Text style={styles.checkLabel}>{task.completed ? "✓" : ""}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>
        ) : null}
        <Text style={styles.footer}>Text, items, and tasks stay on this computer.</Text>
      </ScrollView>
      {similarityPrompt ? (
        <SimilarityDialog
          newer={similarityPrompt.newer}
          older={similarityPrompt.older}
          onChoose={chooseSimilarity}
        />
      ) : null}
    </View>
  );
}

function SimilarPane({
  side,
  caption,
  onDelete,
}: {
  side: SimilarSide;
  caption: string;
  onDelete: () => void;
}) {
  const label = sideLabel(side.title, side.filename);
  return (
    <View style={styles.similarColumn}>
      <Image
        source={{ uri: imageUrl(side.imageUrl) }}
        style={styles.similarThumb}
        resizeMode="contain"
        accessibilityLabel={label}
      />
      <Text style={styles.taskTitle}>{label}</Text>
      {label !== side.filename ? <Text style={styles.hint}>{side.filename}</Text> : null}
      <Text style={styles.hint}>{caption}</Text>
      <Pressable
        style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete the ${caption.toLowerCase()} image ${side.filename}`}
      >
        <Text style={styles.dangerLabel}>Delete this one</Text>
      </Pressable>
    </View>
  );
}

function SimilarityDialog({
  newer,
  older,
  onChoose,
}: {
  newer: SimilarSide;
  older: SimilarSide;
  onChoose: (choice: SimilarityChoice) => void;
}) {
  const { width } = useWindowDimensions();
  const stacked = width < 760;
  return (
    <View style={styles.modalBackdrop}>
      <View style={styles.modalCard} accessibilityViewIsModal>
        <Text style={styles.sectionTitle}>Hmmm...these seem similar. Are these two different images?</Text>
        <View style={stacked ? styles.similarStack : styles.similarRow}>
          <SimilarPane side={newer} caption="Just uploaded" onDelete={() => onChoose("delete-new")} />
          <SimilarPane side={older} caption="Already saved" onDelete={() => onChoose("delete-old")} />
        </View>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          onPress={() => onChoose("keep")}
          accessibilityRole="button"
          accessibilityLabel="Keep both images"
        >
          <Text style={styles.secondaryLabel}>Keep both</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DashboardBlock({ title, lines }: { title: string; lines: Dashboard["todayEvents"] }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {lines.length === 0 ? <Text style={styles.hint}>Nothing here.</Text> : null}
      {lines.map((line, index) => (
        <Text key={`${title}-${index}-${line.title}`} style={styles.body}>
          {line.title}
          {line.when ? ` · ${line.when}` : ""}
          {line.extra ? ` · ${line.extra}` : ""}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    width: "100%",
    maxWidth: 1120,
    alignSelf: "center",
    padding: 24,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  mark: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 42,
    color: colors.ink,
  },
  tagline: {
    fontSize: 18,
    color: colors.green,
  },
  intro: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 22,
    color: colors.muted,
    maxWidth: 640,
  },
  columns: {
    gap: 16,
  },
  columnsWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  column: {
    flex: 1,
    gap: 16,
    minWidth: 0,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  filename: {
    color: colors.muted,
    fontSize: 14,
  },
  body: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  primaryLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  secondaryLabel: {
    color: colors.green,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.55,
  },
  loadingRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  loadingText: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  preview: {
    width: "100%",
    height: 320,
    backgroundColor: "#ebe4d6",
    borderRadius: 12,
  },
  ocrScroll: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
    padding: 12,
  },
  ocrText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  suggestion: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
    gap: 8,
  },
  analysis: {
    backgroundColor: colors.greenSoft,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  analysisRow: {
    gap: 2,
  },
  analysisLabel: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  analysisValue: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
  },
  chipOn: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  chipLabel: {
    color: colors.ink,
    fontSize: 13,
  },
  chipLabelSelected: {
    color: colors.white,
    fontWeight: "700",
  },
  fieldError: {
    color: colors.danger,
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  rowSpread: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  discard: {
    color: colors.danger,
    fontWeight: "700",
  },
  banner: {
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  warningBanner: {
    backgroundColor: colors.noticeSoft,
  },
  warningText: {
    color: colors.notice,
    fontSize: 14,
    lineHeight: 20,
  },
  noticeBanner: {
    backgroundColor: colors.noticeSoft,
  },
  noticeText: {
    color: colors.notice,
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    color: colors.green,
    fontWeight: "700",
  },
  group: {
    gap: 10,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  task: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: "#ebe4d6",
  },
  taskBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  taskTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  completedTitle: {
    textDecorationLine: "line-through",
    color: colors.muted,
  },
  taskMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  support: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: colors.green,
  },
  checkLabel: {
    color: colors.white,
    fontWeight: "700",
  },
  footer: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(30, 26, 22, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 30,
    overflow: "scroll",
  },
  modalCard: {
    width: "100%",
    maxWidth: 760,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 20,
    gap: 16,
  },
  similarRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  similarStack: {
    gap: 16,
  },
  similarColumn: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  similarThumb: {
    width: "100%",
    height: 180,
    backgroundColor: "#ebe4d6",
    borderRadius: 12,
  },
  dangerButton: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  dangerLabel: {
    color: colors.white,
    fontWeight: "700",
  },
});
