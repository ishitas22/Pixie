import { Text, Link } from "../components/Typography";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { messageOf } from "../api";
import { AppShell } from "../components/AppShell";
import { ItemEditor } from "../components/ItemEditor";
import { QrLinks } from "../components/QrLinks";
import { ScreenshotPreview } from "../components/ScreenshotPreview";
import { usePixie } from "../state/PixieProvider";
import { confirmDelete } from "../utils/confirmDelete";
import { theme } from "../theme";
import type { AnalyzeResponse, ItemDraft } from "../types/api";

const CATEGORY_CHOICES = ["campus_events", "career", "extracurriculars", "personal", "other"] as const;

function isCategory(value: string): value is ItemDraft["category"] {
  return (CATEGORY_CHOICES as readonly string[]).includes(value);
}

function editorItem(draft: AnalyzeResponse, finished: boolean): ItemDraft {
  if (finished || draft.category_known !== false) {
    return draft.item;
  }
  return { ...draft.item, category: "" as ItemDraft["category"] };
}

export default function Confirmation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, ready, editDraft, confirmDraft, retryAnalysis, upload, removeScreenshot } = usePixie();
  const [manual, setManual] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const wide = useWindowDimensions().width >= 1100;
  const draft = state.drafts.find((item) => item.draft_id === id);
  const busyHere = upload.busy && (upload.activeId === id || upload.activeId === null);
  const status = draft?.processing_status;
  const failed = status === "model_failed" || status === "ocr_failed" || status === "no_text";
  const waiting = status === "ocr_complete";
  const readyReview = status === "ready" && !failed;

  if (!ready || (busyHere && !draft)) {
    return (
      <AppShell>
        <ActivityIndicator accessibilityLabel={upload.statusText || "Loading draft"} color={theme.colors.purple} />
        <Text accessibilityLiveRegion="polite" style={s.help}>{upload.statusText || "Opening your screenshot…"}</Text>
      </AppShell>
    );
  }
  if (!draft) {
    return (
      <AppShell>
        <Text style={s.heading}>This draft is no longer waiting.</Text>
        <Link href="/" style={s.link}>Back to dashboard</Link>
      </AppShell>
    );
  }

  const current = draft;
  const failureMessage =
    upload.error ||
    current.extraction_error ||
    "Interpretation failed. The screenshot is saved. Retry the analysis or enter the details yourself.";
  const showEditor = readyReview || manual;

  async function removeDraft() {
    if (!confirmDelete(current.item.title || current.filename || "this image")) {
      return;
    }
    setDeleteError("");
    try {
      await removeScreenshot(current.draft_id);
      router.replace("/camera-roll");
    } catch (error) {
      setDeleteError(messageOf(error));
    }
  }

  async function save(item: ItemDraft, withTasks: boolean) {
    const saved = await confirmDraft(id, item, withTasks);
    if (saved) {
      router.replace({ pathname: "/", params: { category: "all", saved } });
    } else {
      router.replace("/camera-roll");
    }
  }

  return (
    <AppShell>
      <View style={s.intro}>
        <Text style={s.chip}>{busyHere ? upload.statusText || "Reading image" : failed ? "COULD NOT INTERPRET" : waiting ? "ANALYZING WITH LOCAL AI" : "READY FOR REVIEW"}</Text>
        <Text role="heading" aria-level={1} style={s.heading}>
          {busyHere ? upload.phase === "reading" ? "Reading image" : upload.phase === "analyzing" ? "Analyzing with local AI" : upload.statusText || "A little review. Then it’s yours." : readyReview ? draft.item.title || "A little review. Then it’s yours." : "A little review. Then it’s yours."}
        </Text>
        <Text style={s.help}>
          {readyReview
            ? "The title, time, location, and actions come from the local reading. A short summary of those details appears with the screenshot when one was found. Dates use MM/DD/YYYY."
            : "This is not a finished reading. Retry the local analysis, or enter the details yourself."}
        </Text>
      </View>
      {busyHere ? (
        <View style={{ alignItems: "flex-start", gap: 12 }}>
          <ActivityIndicator color={theme.colors.purple} />
          <Text accessibilityLiveRegion="polite" style={s.help}>{upload.statusText}</Text>
        </View>
      ) : null}
      {!busyHere && (failed || waiting || upload.error) ? (
        <View style={s.alert}>
          <Text role="alert" style={s.error}>{waiting && !failed ? "This image was read. The local analysis has not finished." : failureMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => void retryAnalysis(id)} disabled={upload.busy}>
            <Text style={s.link}>Retry analysis</Text>
          </Pressable>
        </View>
      ) : null}
      {!busyHere && !showEditor ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Edit details" onPress={() => setManual(true)} style={s.edit}>
          <Text style={s.editText}>Edit</Text>
        </Pressable>
      ) : null}
      {deleteError ? <Text role="alert" style={s.error}>{deleteError}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Delete image" onPress={() => void removeDraft()}>
        <Text style={s.link}>Delete image</Text>
      </Pressable>
      <QrLinks
        codes={draft.qr_codes ?? []}
        note={draft.qr_note}
        tasks={draft.item.tasks}
        onAssign={(taskId, payload, label) => editDraft({
          ...draft,
          item: {
            ...draft.item,
            tasks: draft.item.tasks.map((task) => task.id === taskId ? { ...task, link_url: payload, link_label: label } : task),
          },
        })}
      />
      <View style={{ flexDirection: wide ? "row" : "column", gap: 28, alignItems: "flex-start" }}>
        <View style={{ width: wide ? "43%" : "100%" }}>
          <ScreenshotPreview image={state.images[draft.image_url]} summary={draft.item.summary} />
        </View>
        {showEditor && !busyHere ? (
          <ItemEditor
            key={`${id}:${draft.server_revision ?? 0}:${readyReview ? "ready" : "manual"}`}
            initial={editorItem(draft, readyReview)}
            preserveIds
            onChange={(item) => {
              const chosen = isCategory(item.category);
              editDraft({
                ...draft,
                category_known: draft.category_known || chosen,
                item: chosen ? item : { ...item, category: draft.item.category },
              });
            }}
            onCancel={() => {
              if (!readyReview) {
                setManual(false);
                return;
              }
              router.replace("/");
            }}
            onSave={(item) => save(item, true)}
            onSaveWithoutTasks={(item) => save(item, false)}
          />
        ) : <View style={{ flex: 1 }} />}
      </View>
      {!busyHere && readyReview ? (
        <View style={{ marginTop: 18 }}>
          <Pressable accessibilityRole="button" onPress={() => void retryAnalysis(id)} disabled={upload.busy}>
            <Text style={s.link}>Retry analysis</Text>
          </Pressable>
        </View>
      ) : null}
    </AppShell>
  );
}

const s = StyleSheet.create({
  intro: { gap: 12, marginBottom: 28 },
  chip: { alignSelf: "flex-start", padding: 9, borderRadius: 9, backgroundColor: "#FFF0BB", color: "#79551B", fontSize: 10, fontWeight: "700" },
  heading: { fontFamily: "PixieHeading", fontSize: 29, fontWeight: "800", color: theme.colors.ink, lineHeight: 38 },
  help: { fontSize: 12, lineHeight: 21, color: theme.colors.muted },
  link: { color: theme.colors.purple, fontSize: 12, fontWeight: "600" },
  edit: { alignSelf: "flex-start", backgroundColor: theme.colors.pink, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginBottom: 14 },
  editText: { color: theme.colors.ink, fontSize: 14, fontWeight: "600" },
  alert: { gap: 10, padding: 16, borderRadius: 16, backgroundColor: "#FFF0BB", marginBottom: 18 },
  error: { color: "#A33158", fontSize: 13, lineHeight: 21 },
});
