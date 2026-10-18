import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from "react";
import {
  addItemTask,
  addManualItem,
  approveScreenshot,
  deleteScreenshot,
  getGallery,
  getScreenshotDetail,
  interpretScreenshot,
  messageOf,
  PixieApiError,
  reanalyze,
  saveItem,
  setTaskCompleted,
  updateTask,
  uploadScreenshot,
} from "../api";
import { similarFrom, type SimilarSide } from "../components/SimilarityPrompt";
import {
  chosenTasks,
  imageFor,
  needsReview,
  toApiCategory,
  toDraft,
  toSaved,
} from "../services/adapt";
import type { ImportResult, SavedItem as ApiItem, SimilarImage } from "../types";
import type { AnalyzeResponse, ItemDraft } from "../types/api";
import type { PixieState } from "./model";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type SimilarityChoice = "keep" | "delete-new" | "delete-old";

export type UploadState = {
  busy: boolean;
  error: string;
  phase: "idle" | "reading" | "analyzing" | "saving";
  statusText: string;
  activeId: string | null;
};

const idleUpload: UploadState = { busy: false, error: "", phase: "idle", statusText: "", activeId: null };

type Store = {
  completeTask: (itemId: string, index: number) => void;
  state: PixieState;
  ready: boolean;
  storageWarning: string;
  upload: UploadState;
  revision: number;
  similarity: { newer: SimilarSide; older: SimilarSide } | null;
  confetti: number;
  chooseSimilarity: (choice: SimilarityChoice) => void;
  pickScreenshot: () => Promise<void>;
  ingestFiles: (files: File[]) => Promise<void>;
  removeScreenshot: (screenshotId: string) => Promise<void>;
  cancelUpload: () => void;
  editDraft: (draft: AnalyzeResponse) => void;
  confirmDraft: (draftId: string, item: ItemDraft, withTasks?: boolean) => Promise<string>;
  updateItem: (id: string, patch: Partial<ItemDraft>) => Promise<void>;
  retryAnalysis: (screenshotId: string) => Promise<void>;
  realItem: (id: string) => ApiItem | undefined;
};

const Context = createContext<Store | null>(null);

function supportedName(mimeType: string | null | undefined, filename: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  const name = filename.toLowerCase();
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

function isSupportedImage(asset: DocumentPicker.DocumentPickerAsset): boolean {
  return supportedName(asset.mimeType, asset.name);
}

function fileSupported(file: File): boolean {
  return supportedName(file.type, file.name);
}

function progressLabel(verb: string, index: number, total: number, filename: string): string {
  const count = total > 1 ? ` (${index} of ${total})` : "";
  const name = filename ? ` · ${filename}` : "";
  return `${verb}${count}${name}`;
}

export function PixieProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<PixieState>({ version: 1, items: [], drafts: [], images: {} });
  const [realItems, setRealItems] = useState<Record<string, ApiItem>>({});
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [upload, setUpload] = useState<UploadState>(idleUpload);
  const [revision, setRevision] = useState(0);
  const [similarity, setSimilarity] = useState<{ newer: SimilarSide; older: SimilarSide } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const bundles = useRef<Record<string, ImportResult>>({});
  const realItemsRef = useRef(realItems);
  const epochRef = useRef(0);
  const uploadToken = useRef(0);
  const serverRevision = useRef(0);
  const similarityResolver = useRef<((choice: SimilarityChoice) => void) | null>(null);
  realItemsRef.current = realItems;

  function apply(details: ImportResult[]) {
    serverRevision.current += 1;
    const revisionNumber = serverRevision.current;
    const items: PixieState["items"] = [];
    const drafts: AnalyzeResponse[] = [];
    const images: PixieState["images"] = {};
    const real: Record<string, ApiItem> = {};
    const nextBundles: Record<string, ImportResult> = {};
    for (const detail of details) {
      nextBundles[detail.screenshot.id] = detail;
      if (detail.screenshot.imageUrl) {
        images[detail.screenshot.imageUrl] = imageFor(detail.screenshot);
      }
      if (needsReview(detail)) {
        drafts.push(toDraft(detail, revisionNumber));
      } else {
        items.push(...toSaved(detail));
        for (const item of detail.items) {
          real[item.id] = item;
        }
      }
    }
    bundles.current = nextBundles;
    setRealItems(real);
    setState({ version: 1, items, drafts, images });
  }

  function forgetLocal(id: string) {
    const bundle = bundles.current[id];
    delete bundles.current[id];
    const path = bundle?.screenshot.imageUrl;
    setRealItems((current) => {
      const next = { ...current };
      for (const item of bundle?.items ?? []) {
        delete next[item.id];
      }
      return next;
    });
    setState((current) => {
      const images = { ...current.images };
      if (path) {
        delete images[path];
      }
      return {
        ...current,
        drafts: current.drafts.filter((draft) => draft.draft_id !== id),
        items: current.items.filter((item) => item.screenshot_id !== id),
        images,
      };
    });
  }

  async function refresh() {
    const epoch = ++epochRef.current;
    const gallery = await getGallery("All");
    const settled = await Promise.allSettled(gallery.map((image) => getScreenshotDetail(image.id)));
    if (epoch !== epochRef.current) {
      return;
    }
    const details = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const failed = settled.length - details.length;
    setStorageWarning(
      failed ? `${failed} screenshot${failed === 1 ? "" : "s"} could not be loaded from the local API.` : "",
    );
    apply(details);
    setRevision((current) => current + 1);
  }

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let active = true;
    refreshRef
      .current()
      .catch((error: unknown) => {
        if (active) {
          setStorageWarning(messageOf(error));
        }
      })
      .finally(() => {
        if (active) {
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function chooseSimilarity(choice: SimilarityChoice) {
    const resolve = similarityResolver.current;
    similarityResolver.current = null;
    setSimilarity(null);
    resolve?.(choice);
  }

  function askSimilarity(newer: SimilarSide, older: SimilarSide): Promise<SimilarityChoice> {
    return new Promise((resolve) => {
      similarityResolver.current = resolve;
      setSimilarity({ newer, older });
    });
  }

  async function settleSimilar(
    newer: SimilarSide,
    matches: SimilarImage[],
    problems: string[],
    token: number,
  ): Promise<boolean> {
    for (const match of matches) {
      if (token !== uploadToken.current) {
        return true;
      }
      if (!match.id || match.id === newer.id) {
        continue;
      }
      const choice = await askSimilarity(newer, similarFrom(match));
      if (token !== uploadToken.current) {
        return true;
      }
      if (choice === "keep") {
        continue;
      }
      const targetId = choice === "delete-new" ? newer.id : match.id;
      const label = choice === "delete-new" ? newer.filename : match.filename;
      try {
        await deleteScreenshot(targetId);
      } catch (error) {
        problems.push(`${label}: ${messageOf(error)}`);
        continue;
      }
      forgetLocal(targetId);
      try {
        await refreshRef.current();
      } catch (error) {
        problems.push(messageOf(error));
      }
      if (choice === "delete-new") {
        return true;
      }
    }
    return false;
  }

  function cancelUpload() {
    uploadToken.current += 1;
    similarityResolver.current?.("keep");
    similarityResolver.current = null;
    setSimilarity(null);
    setUpload(idleUpload);
    void refreshRef.current().catch((error: unknown) => setStorageWarning(messageOf(error)));
    router.replace("/");
  }

  async function pickScreenshot() {
    if (!ready || upload.phase !== "idle") {
      return;
    }
    const token = ++uploadToken.current;
    setUpload({ ...idleUpload, busy: true, phase: "reading", statusText: "Reading image" });
    router.push("/upload");
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ["image/png", "image/jpeg", "image/heic", "image/heif", ".heic", ".heif"],
        multiple: true,
        copyToCacheDirectory: true,
        base64: false,
      });
    } catch {
      if (token === uploadToken.current) {
        setUpload({ ...idleUpload, error: "The file picker could not open. Try choosing the screenshot again." });
      }
      return;
    }
    if (token !== uploadToken.current || result.canceled || !result.assets?.length) {
      if (token === uploadToken.current) {
        setUpload(idleUpload);
      }
      return;
    }

    const accepted: File[] = [];
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
      accepted.push(asset.file);
    }
    await importChosen(accepted, token, problems);
  }

  async function ingestFiles(files: File[]) {
    if (!ready || upload.phase !== "idle") {
      return;
    }
    const token = ++uploadToken.current;
    setUpload({ ...idleUpload, busy: true, phase: "reading", statusText: "Reading image" });
    router.push("/upload");
    const accepted: File[] = [];
    const problems: string[] = [];
    for (const file of files) {
      if (!fileSupported(file)) {
        problems.push(`${file.name}: choose a PNG, JPEG, or HEIC screenshot.`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        problems.push(`${file.name} is larger than 8 MB.`);
        continue;
      }
      accepted.push(file);
    }
    await importChosen(accepted, token, problems);
  }

  async function importChosen(accepted: File[], token: number, problems: string[]) {
    if (token !== uploadToken.current) {
      return;
    }
    if (!accepted.length) {
      setUpload({ ...idleUpload, error: problems.join(" ") || "Choose a PNG, JPEG, or HEIC screenshot." });
      return;
    }

    let lastDraftId: string | null = null;
    for (let index = 0; index < accepted.length; index += 1) {
      if (token !== uploadToken.current) {
        return;
      }
      const file = accepted[index];
      const count = index + 1;
      setUpload({
        busy: true,
        error: "",
        phase: "reading",
        statusText: progressLabel("Reading image", count, accepted.length, file.name),
        activeId: null,
      });
      try {
        const uploaded = await uploadScreenshot(file);
        if (token !== uploadToken.current) {
          return;
        }
        const newer: SimilarSide = {
          id: uploaded.screenshot.id,
          filename: uploaded.screenshot.filename || file.name,
          title: uploaded.screenshot.draftTitle || uploaded.screenshot.displayTitle || file.name,
          imageUrl: uploaded.screenshot.imageUrl,
        };
        if (uploaded.similar.length) {
          setUpload((current) => ({
            ...current,
            activeId: uploaded.screenshot.id,
            statusText: "Waiting for you to compare two similar images.",
          }));
        } else {
          setUpload((current) => ({ ...current, activeId: uploaded.screenshot.id }));
        }
        const dropped = uploaded.similar.length
          ? await settleSimilar(newer, uploaded.similar, problems, token)
          : false;
        if (dropped || token !== uploadToken.current) {
          continue;
        }
        const readStatus = uploaded.screenshot.processingStatus;
        if (readStatus === "ocr_failed" || readStatus === "no_text") {
          const message = uploaded.screenshot.extractionError || "Pixie could not read this screenshot.";
          problems.push(`${file.name}: ${message}`);
          lastDraftId = uploaded.screenshot.id;
          continue;
        }
        setUpload({
          busy: true,
          error: "",
          phase: "analyzing",
          statusText: `Analyzing with local AI${accepted.length > 1 ? ` (${count} of ${accepted.length})` : ""}. This stays on your laptop and can take a minute.`,
          activeId: uploaded.screenshot.id,
        });
        const interpreted = await interpretScreenshot(uploaded.screenshot.id);
        if (token !== uploadToken.current) {
          return;
        }
        lastDraftId = interpreted.screenshot.id;
        if (interpreted.screenshot.processingStatus !== "ready") {
          const message =
            interpreted.screenshot.extractionError ||
            "Interpretation failed. The screenshot is saved. Retry the analysis or enter the details yourself.";
          problems.push(`${file.name}: ${message}`);
        }
      } catch (error) {
        const failed = error instanceof PixieApiError ? error.screenshot ?? null : null;
        const matches = error instanceof PixieApiError ? error.similar : [];
        if (failed && matches.length) {
          const dropped = await settleSimilar(
            {
              id: failed.id,
              filename: failed.filename || file.name,
              title: failed.draftTitle || failed.displayTitle || file.name,
              imageUrl: failed.imageUrl,
            },
            matches,
            problems,
            token,
          );
          if (dropped) {
            continue;
          }
        }
        problems.push(`${file.name}: ${messageOf(error)}`);
        if (failed) {
          lastDraftId = failed.id;
        }
      }
    }

    if (token !== uploadToken.current) {
      return;
    }
    try {
      await refreshRef.current();
    } catch (error) {
      problems.push(messageOf(error));
    }
    setUpload({ ...idleUpload, error: problems.join(" "), statusText: lastDraftId ? "Ready for review" : "" });
    if (lastDraftId) {
      router.replace({ pathname: "/confirmation/[id]", params: { id: lastDraftId } });
    }
  }

  function editDraft(draft: AnalyzeResponse) {
    setState((current) => ({
      ...current,
      drafts: current.drafts.map((item) => (item.draft_id === draft.draft_id ? draft : item)),
    }));
  }

  async function confirmDraft(draftId: string, form: ItemDraft, withTasks = true): Promise<string> {
    setUpload({ ...idleUpload, busy: true, phase: "saving", statusText: "Saving…" });
    try {
      let current = bundles.current[draftId] ?? (await getScreenshotDetail(draftId));
      const category = toApiCategory(form.category);
      const tasks = chosenTasks(form.tasks, withTasks);
      if (!current.items.length) {
        await addManualItem(draftId, form.title.trim(), category);
        current = await getScreenshotDetail(draftId);
      }
      const saved = await approveScreenshot(draftId, {
        title: form.title.trim(),
        category,
        summary: form.summary.trim() || null,
        taskIds: tasks.flatMap((task) => (task.id ? [task.id] : [])),
        tasks: tasks.flatMap((task) =>
          task.id ? [{ id: task.id, title: task.title.trim(), linkUrl: task.link_url, linkLabel: task.link_label }] : [],
        ),
        items: current.items.map((apiItem, index) => ({
          id: apiItem.id,
          title: index === 0 || current.items.length === 1 ? form.title.trim() : apiItem.title,
          eventDate: index === 0 ? form.event?.date ?? "" : apiItem.eventDate,
          endDate: apiItem.endDate,
          startTime: index === 0 ? form.event?.time ?? "" : apiItem.startTime,
          endTime: apiItem.endTime,
          location: index === 0 ? form.event?.location ?? "" : apiItem.location,
          meetingUrl: apiItem.meetingUrl,
        })),
      });
      const primary = saved.items[0];
      if (primary) {
        await saveItem(primary.id, {
          title: form.title.trim(),
          summary: form.summary.trim(),
          category,
          supportingText: primary.supportingText,
          eventDate: form.event?.date ?? "",
          endDate: primary.endDate,
          startTime: form.event?.time ?? "",
          endTime: primary.endTime,
          location: form.event?.location ?? "",
          meetingUrl: primary.meetingUrl,
          registrationRequired: primary.registrationRequired,
          registrationUrl: form.event?.registration_url ?? "",
          registrationDeadline: primary.registrationDeadline,
          registrationStatus: primary.registrationStatus,
        });
        if (withTasks) {
          for (const task of tasks) {
            if (task.id) {
              await updateTask(task.id, { title: task.title.trim(), deadline: task.due_date });
            } else {
              const created = await addItemTask(primary.id, task.title.trim());
              if (task.due_date) {
                await updateTask(created.id, { deadline: task.due_date });
              }
            }
          }
        }
      }
      await refreshRef.current();
      setUpload(idleUpload);
      return primary?.id ?? "";
    } catch (error) {
      setUpload({ ...idleUpload, error: messageOf(error) });
      throw error;
    }
  }

  async function updateItem(id: string, patch: Partial<ItemDraft>) {
    const real = realItemsRef.current[id];
    if (!real) {
      throw new Error("This item is no longer available.");
    }
    const category = patch.category ? toApiCategory(patch.category) : real.category;
    await saveItem(id, {
      title: (patch.title ?? real.title).trim(),
      summary: patch.summary ?? real.summary,
      category,
      supportingText: real.supportingText,
      eventDate: patch.event ? patch.event.date ?? "" : real.eventDate,
      endDate: real.endDate,
      startTime: patch.event ? patch.event.time ?? "" : real.startTime,
      endTime: real.endTime,
      location: patch.event ? patch.event.location ?? "" : real.location,
      meetingUrl: real.meetingUrl,
      registrationRequired: real.registrationRequired,
      registrationUrl: patch.event ? patch.event.registration_url ?? "" : real.registrationUrl,
      registrationDeadline: real.registrationDeadline,
      registrationStatus: real.registrationStatus,
    });
    if (patch.tasks) {
      const previous = real.tasks.filter((task) => task.status === "accepted");
      const kept = new Set(patch.tasks.map((task) => task.id).filter((taskId): taskId is string => Boolean(taskId)));
      for (const task of previous) {
        if (!kept.has(task.id)) {
          await updateTask(task.id, { status: "discarded" });
        }
      }
      for (const task of patch.tasks) {
        if (!task.title.trim()) {
          continue;
        }
        if (task.id) {
          await updateTask(task.id, { title: task.title.trim(), deadline: task.due_date, completed: Boolean(task.completed) });
        } else {
          const created = await addItemTask(id, task.title.trim());
          if (task.due_date || task.completed) {
            await updateTask(created.id, { deadline: task.due_date, completed: Boolean(task.completed) });
          }
        }
      }
    }
    const markedDone = (patch.tasks ?? []).some((task) => {
      if (!task.completed) {
        return false;
      }
      const previous = task.id ? real.tasks.find((entry) => entry.id === task.id) : undefined;
      return !previous?.completed;
    });
    await refreshRef.current();
    if (markedDone) {
      setConfetti((current) => current + 1);
    }
  }

  async function removeScreenshot(screenshotId: string) {
    await deleteScreenshot(screenshotId);
    forgetLocal(screenshotId);
    try {
      await refreshRef.current();
    } catch (error) {
      setStorageWarning(messageOf(error));
    }
  }

  async function retryAnalysis(screenshotId: string) {
    if (upload.phase !== "idle") {
      return;
    }
    const token = ++uploadToken.current;
    setUpload({ busy: true, error: "", phase: "reading", statusText: "Reading image", activeId: screenshotId });
    try {
      const reread = await reanalyze(screenshotId);
      if (token !== uploadToken.current) {
        return;
      }
      if (reread.screenshot.processingStatus === "ocr_failed" || reread.screenshot.processingStatus === "no_text") {
        const message = reread.screenshot.extractionError || "Pixie could not read this screenshot.";
        setUpload({ ...idleUpload, error: message, activeId: screenshotId });
        await refreshRef.current();
        return;
      }
      setUpload({
        busy: true,
        error: "",
        phase: "analyzing",
        statusText: "Analyzing with local AI. This stays on your laptop and can take a minute.",
        activeId: screenshotId,
      });
      const imported = await interpretScreenshot(screenshotId);
      if (token !== uploadToken.current) {
        return;
      }
      const failed = imported.screenshot.processingStatus !== "ready";
      setUpload({
        ...idleUpload,
        error: failed
          ? imported.screenshot.extractionError ||
            "Interpretation failed. The screenshot is saved. Retry the analysis or enter the details yourself."
          : "",
        statusText: failed ? "" : "Ready for review",
      });
      await refreshRef.current();
    } catch (error) {
      if (token === uploadToken.current) {
        setUpload({ ...idleUpload, error: messageOf(error) });
      }
    }
  }

  async function completeTask(itemId: string, index: number) {
    const item = state.items.find((entry) => entry.id === itemId);
    const task = item?.tasks[index];
    if (!task?.id || task.completed) {
      return;
    }
    try {
      await setTaskCompleted(task.id, true);
      await refreshRef.current();
      setConfetti((current) => current + 1);
    } catch (error) {
      setStorageWarning(messageOf(error));
    }
  }

  const value: Store = {
    completeTask,
    state,
    ready,
    storageWarning,
    upload,
    revision,
    similarity,
    confetti,
    chooseSimilarity,
    pickScreenshot,
    ingestFiles,
    removeScreenshot,
    cancelUpload,
    editDraft,
    confirmDraft,
    updateItem,
    retryAnalysis,
    realItem: (id) => realItems[id],
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePixie() {
  const value = useContext(Context);
  if (!value) {
    throw new Error("PixieProvider is required.");
  }
  return value;
}
